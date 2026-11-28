import express from 'express';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { MONUMENTS, AVAILABLE_REGIONS } from './src/data/monuments.ts';
import {
  RAW_IMAGE_MANIFEST,
  RAW_SURVEY_ARTWORKS,
  DATASET_IMAGE_URL_MAP,
} from './src/data/surveyDataset.ts';
import type { Monument } from './src/types.ts';

dotenv.config();

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = http.createServer(app);
const portArgIndex = process.argv.indexOf('--port');
const eqPortArg = process.argv.find((arg) => arg.startsWith('--port='));
const cliPortRaw =
  portArgIndex !== -1
    ? process.argv[portArgIndex + 1]
    : eqPortArg
    ? eqPortArg.slice('--port='.length)
    : undefined;
const cliPort = cliPortRaw ? parseInt(cliPortRaw, 10) : undefined;
const PORT =
  cliPort && Number.isFinite(cliPort)
    ? cliPort
    : process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : 3000;

app.use(express.json({ limit: '25mb' }));

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function normalizeMimeType(raw?: unknown): string {
  const value = typeof raw === 'string' ? raw.toLowerCase().trim() : 'image/jpeg';
  if (value === 'image/jpg') return 'image/jpeg';
  return ALLOWED_IMAGE_MIME_TYPES.has(value) ? value : 'image/jpeg';
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface IndexedReferenceImage {
  monument: Monument;
  logicalPath: string;
  imageUrl: string;
  filePath: string;
  sha256: string;
  base64: string;
}

const REFERENCE_IMAGES: IndexedReferenceImage[] = [];
const HASH_TO_REFERENCE = new Map<string, IndexedReferenceImage>();
const PRIMARY_REF_BY_MONUMENT_ID = new Map<string, IndexedReferenceImage>();
const LOGICAL_TO_DISK_PATH = new Map<string, string>();
const VISUAL_OBSERVATION_CACHE = new Map<string, string>();

let lastPublicImagesCount = -1;

function countFilesInDir(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0;
    return fs.readdirSync(dirPath).length;
  } catch {
    return 0;
  }
}

function resolveLogicalImageOnDisk(logicalPath: string): { filePath: string; imageUrl: string } | null {
  const cleanRel = logicalPath.replace(/^\/+/, '');
  if (!cleanRel) return null;

  // 1. Direct static asset in /public/images/ or /dist/images/ (e.g. public/images/artwork_001_01.jpg)
  const publicDirect = path.resolve(ROOT_DIR, 'public', cleanRel);
  if (fs.existsSync(publicDirect) && fs.statSync(publicDirect).isFile()) {
    return { filePath: publicDirect, imageUrl: `/${cleanRel}` };
  }

  const distDirect = path.resolve(ROOT_DIR, 'dist', cleanRel);
  if (fs.existsSync(distDirect) && fs.statSync(distDirect).isFile()) {
    return { filePath: distDirect, imageUrl: `/${cleanRel}` };
  }

  // 2. Verified existing archive mapping via (arcgisGlobalId + originalFilename)
  const mappedArchiveUrl = DATASET_IMAGE_URL_MAP[cleanRel];
  if (mappedArchiveUrl) {
    const archiveRel = mappedArchiveUrl.replace(/^\/+/, '');
    const publicArchive = path.resolve(ROOT_DIR, 'public', archiveRel);
    if (fs.existsSync(publicArchive) && fs.statSync(publicArchive).isFile()) {
      return { filePath: publicArchive, imageUrl: mappedArchiveUrl };
    }
    const distArchive = path.resolve(ROOT_DIR, 'dist', archiveRel);
    if (fs.existsSync(distArchive) && fs.statSync(distArchive).isFile()) {
      return { filePath: distArchive, imageUrl: mappedArchiveUrl };
    }
  }

  return null;
}

function ensureSurveyReferenceImagesIndexed() {
  const publicImagesDir = path.resolve(ROOT_DIR, 'public', 'images');
  const publicAistudioDir = path.resolve(ROOT_DIR, 'public', 'assets', 'aistudio');
  const currentDiskCount = countFilesInDir(publicImagesDir) + countFilesInDir(publicAistudioDir);

  if (lastPublicImagesCount === currentDiskCount && lastPublicImagesCount !== -1) {
    return;
  }
  lastPublicImagesCount = currentDiskCount;

  REFERENCE_IMAGES.length = 0;
  HASH_TO_REFERENCE.clear();
  PRIMARY_REF_BY_MONUMENT_ID.clear();
  LOGICAL_TO_DISK_PATH.clear();

  const monumentById = new Map<string, Monument>(MONUMENTS.map((m) => [m.id, m]));

  for (const raw of RAW_SURVEY_ARTWORKS) {
    const monument = monumentById.get(raw.id);
    if (!monument) continue;

    for (const logicalPath of raw.images) {
      const resolved = resolveLogicalImageOnDisk(logicalPath);
      if (!resolved) continue;

      try {
        const buffer = fs.readFileSync(resolved.filePath);
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        const base64 = buffer.toString('base64');
        const entry: IndexedReferenceImage = {
          monument,
          logicalPath,
          imageUrl: resolved.imageUrl,
          filePath: resolved.filePath,
          sha256,
          base64,
        };
        REFERENCE_IMAGES.push(entry);
        HASH_TO_REFERENCE.set(sha256, entry);
        LOGICAL_TO_DISK_PATH.set(logicalPath.replace(/^\/+/, ''), resolved.filePath);
        if (!PRIMARY_REF_BY_MONUMENT_ID.has(monument.id)) {
          PRIMARY_REF_BY_MONUMENT_ID.set(monument.id, entry);
        }
      } catch (readErr) {
        console.warn(`Unable to read reference image ${resolved.filePath}:`, readErr);
      }
    }
  }

  const missingImagesCount = RAW_IMAGE_MANIFEST.length - REFERENCE_IMAGES.length;
  console.log(
    `PreserVenice catalog loaded: ${MONUMENTS.length} artworks across ${AVAILABLE_REGIONS.length} Venice regions (${RAW_IMAGE_MANIFEST.length} manifest entries). Indexed ${REFERENCE_IMAGES.length} accessible reference image(s) covering ${PRIMARY_REF_BY_MONUMENT_ID.size} artwork(s)${missingImagesCount > 0 ? ` (${missingImagesCount} missing/inaccessible)` : ''}.`
  );
}

// Serve uploaded artwork images from /public/images and /dist/images cleanly,
// returning 404 (never HTML SPA fallback) when a photograph has not been supplied yet.
app.use('/images', express.static(path.resolve(ROOT_DIR, 'public', 'images'), { fallthrough: true }));
app.use('/images', express.static(path.resolve(ROOT_DIR, 'dist', 'images'), { fallthrough: true }));
app.use('/images', (req, res) => {
  ensureSurveyReferenceImagesIndexed();
  const relKey = `images/${req.path.replace(/^\/+/, '')}`;
  const diskFallback = LOGICAL_TO_DISK_PATH.get(relKey);
  if (diskFallback && fs.existsSync(diskFallback)) {
    return res.sendFile(diskFallback);
  }
  return res.status(404).json({
    error: 'Reference photograph not yet supplied.',
    imagePath: relKey,
  });
});

// Health & dataset status endpoint
app.get('/api/health', (_req, res) => {
  ensureSurveyReferenceImagesIndexed();
  res.json({
    status: 'ok',
    monumentsCount: MONUMENTS.length,
    regionsCount: AVAILABLE_REGIONS.length,
    manifestAttachmentsCount: RAW_IMAGE_MANIFEST.length,
    indexedImagesCount: REFERENCE_IMAGES.length,
    indexedMonumentsCount: PRIMARY_REF_BY_MONUMENT_ID.size,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
});

async function selectCandidateReferences(
  aiClient: GoogleGenAI,
  queryBase64: string,
  mimeType: string,
  latitude?: number,
  longitude?: number
): Promise<{
  isVenetianArtworkQuery: boolean;
  detectedCategoryHint: string;
  queryDescription: string;
  candidates: IndexedReferenceImage[];
}> {
  const MAX_MULTIMODAL_REFS = 36;

  // If all accessible reference images fit comfortably inside one Gemini multimodal call,
  // compare against all of them directly.
  if (REFERENCE_IMAGES.length <= MAX_MULTIMODAL_REFS) {
    return {
      isVenetianArtworkQuery: true,
      detectedCategoryHint: 'Unknown',
      queryDescription: '',
      candidates: REFERENCE_IMAGES,
    };
  }

  // Scalable Stage 1: Analyze query image & rank across the 402-artwork indexed dataset
  let detectedCategoryHint = 'Unknown';
  let queryDescription = '';
  let isVenetianArtworkQuery = true;

  try {
    const preResponse = await aiClient.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: queryBase64,
            },
          },
          {
            text: 'Inspect this image. Determine if it shows an outdoor Venetian sculpture, statue, facade relief, plaque, or public monument. Identify its category (Statues, Reliefs, Monuments, or Unknown) and describe concise visible features (form, stone/material, mounting wall/plinth, reliefs count).',
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isOutdoorArtwork: { type: Type.BOOLEAN },
            detectedCategory: { type: Type.STRING },
            visualSummary: { type: Type.STRING },
          },
          required: ['isOutdoorArtwork', 'detectedCategory', 'visualSummary'],
        },
      },
    });
    const preParsed = JSON.parse((preResponse.text ?? '{}').trim());
    isVenetianArtworkQuery = Boolean(preParsed.isOutdoorArtwork);
    detectedCategoryHint = preParsed.detectedCategory || 'Unknown';
    queryDescription = preParsed.visualSummary || '';
  } catch {
    // Proceed cleanly with spatial + category ranking if pre-analysis fails
  }

  if (!isVenetianArtworkQuery && queryDescription) {
    return {
      isVenetianArtworkQuery: false,
      detectedCategoryHint,
      queryDescription,
      candidates: [],
    };
  }

  const scored = REFERENCE_IMAGES.map((ref) => {
    let score = 0;
    const m = ref.monument;

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      const distM = haversineMeters(latitude, longitude, m.coordinates.lat, m.coordinates.lng);
      // Strong boost within 500m, smooth decay beyond
      score += Math.max(0, 100 - distM / 8);
    }

    if (
      detectedCategoryHint === 'Statues' ||
      detectedCategoryHint === 'Reliefs' ||
      detectedCategoryHint === 'Monuments'
    ) {
      if (m.category === detectedCategoryHint) {
        score += 20;
      }
    }

    if (queryDescription && m.generalNotes) {
      const qLower = queryDescription.toLowerCase();
      const notesWords = m.generalNotes.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const word of notesWords) {
        if (qLower.includes(word)) score += 6;
      }
    }

    return { ref, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: IndexedReferenceImage[] = [];
  const seenMonumentIds = new Set<string>();
  for (const item of scored) {
    if (selected.length >= MAX_MULTIMODAL_REFS) break;
    if (!seenMonumentIds.has(item.ref.monument.id)) {
      seenMonumentIds.add(item.ref.monument.id);
      selected.push(item.ref);
    }
  }

  return {
    isVenetianArtworkQuery: true,
    detectedCategoryHint,
    queryDescription,
    candidates: selected,
  };
}

// Google Lens style visual recognition endpoint supporting all 402 Venice Survey123 artworks
app.post('/api/lens/recognize', async (req, res) => {
  try {
    ensureSurveyReferenceImagesIndexed();
    const { imageBase64, mimeType: rawMimeType, latitude, longitude } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing imageBase64 data in request body.',
      });
    }

    const mimeType = normalizeMimeType(rawMimeType);
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const queryBuffer = Buffer.from(cleanBase64, 'base64');
    if (queryBuffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Uploaded image data was empty or corrupted.',
      });
    }

    const queryHash = crypto.createHash('sha256').update(queryBuffer).digest('hex');

    const aiClient = process.env.GEMINI_API_KEY
      ? new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        })
      : null;

    // 1. Exact binary SHA-256 match against accessible indexed reference photos
    const exactMatch = HASH_TO_REFERENCE.get(queryHash);
    if (exactMatch) {
      const m = exactMatch.monument;
      let visualEvidence = VISUAL_OBSERVATION_CACHE.get(m.id);

      if (!visualEvidence && aiClient) {
        try {
          const obsResponse = await aiClient.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: `Describe only the visible sculptural features, architectural placement, and stonework observable in this Venetian ${m.category} photo in 1-2 concise sentences. Do NOT invent an artist name, date, title, or historical provenance.`,
                },
              ],
            },
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          const obsText = (obsResponse.text ?? '').trim();
          if (obsText) {
            visualEvidence = obsText;
            VISUAL_OBSERVATION_CACHE.set(m.id, obsText);
          }
        } catch (obsErr: any) {
          console.warn('Gemini single-image observation skipped:', obsErr?.message);
        }
      }

      return res.json({
        success: true,
        matched: true,
        match: {
          monument: m,
          confidence: 99,
          visualEvidence:
            visualEvidence ||
            `Exact visual match with Survey123 record ${m.surveyCode} (${m.category}) documented at ${m.coordinates.formatted} in ${m.locationName}.`,
          detectedCategory: m.category,
          engine: aiClient
            ? 'SHA-256 + Gemini 4 Vision (Venice Survey123)'
            : 'Survey123 Exact Image Fingerprint Matcher',
        },
      });
    }

    // 2. If no reference photographs are loaded on disk yet, return honest uncatalogued state
    if (REFERENCE_IMAGES.length === 0) {
      return res.json({
        success: true,
        matched: false,
        message:
          'Reference photographs have not yet been supplied for visual comparison against the 402-artwork catalog. You can log this artifact via the CITIZEN GIS SURVEY.',
      });
    }

    if (!aiClient) {
      return res.status(503).json({
        success: false,
        error:
          'Visual recognition service is unavailable because GEMINI_API_KEY is not configured on the server.',
      });
    }

    // 3. Multi-stage Gemini 4 multimodal visual comparison across indexed reference artworks
    const shortlist = await selectCandidateReferences(
      aiClient,
      cleanBase64,
      mimeType,
      typeof latitude === 'number' ? latitude : undefined,
      typeof longitude === 'number' ? longitude : undefined
    );

    if (!shortlist.isVenetianArtworkQuery || shortlist.candidates.length === 0) {
      return res.json({
        success: true,
        matched: false,
        message:
          shortlist.queryDescription ||
          'This artifact does not match any currently indexed Survey123 reference photograph in the Venice catalog.',
      });
    }

    const systemInstruction = `You are the visual recognition engine for PreserVenice, operating over an ArcGIS Survey123 catalog (${MONUMENTS.length} artworks across ${AVAILABLE_REGIONS.length} Venice regions; ${PRIMARY_REF_BY_MONUMENT_ID.size} artworks currently have loaded reference photos).
Compare the [QUERY_IMAGE] visually against the labeled [REF_ARTWORK] photos below.
CRITICAL RULES:
- Match strictly on visual appearance of the sculpture/relief/monument and its surrounding stonework/facade, accounting for different camera angles, lighting, framing, or cropping from mobile phones.
- If the [QUERY_IMAGE] clearly matches one of the [REF_ARTWORK] entries, set isMatch=true, return its exact id in matchedMonumentId, and set confidence between 50 and 99.
- If the [QUERY_IMAGE] does NOT depict any of the provided [REF_ARTWORK] entries (for example: an unrelated object, unreadable dark/blurred image, or an artwork whose reference photograph is not among the provided candidates), set isMatch=false, matchedMonumentId="", confidence below 40, and explain in visualEvidence what is visible and why no match was confirmed.
- NEVER invent an artist, date, historical title, material name, or provenance not recorded in the Survey123 catalog.
- In visualEvidence, describe only observable visual features.`;

    const parts: any[] = [
      {
        text: '[QUERY_IMAGE] Identify which Venice Survey123 artwork this photo shows (or set isMatch=false if none match):',
      },
      {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      },
    ];

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      parts.push({
        text: `Optional device GPS context: lat=${latitude}, lng=${longitude}`,
      });
    }

    for (const ref of shortlist.candidates) {
      const m = ref.monument;
      parts.push({
        text: `[REF_ARTWORK id="${m.id}" code="${m.surveyCode}" region="${m.rawRegion}" type="${m.category}" coords="${m.coordinates.lat.toFixed(5)},${m.coordinates.lng.toFixed(5)}" notes="${m.generalNotes || 'None'}"]`,
      });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: ref.base64,
        },
      });
    }

    let lastGeminiError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiClient.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isMatch: {
                  type: Type.BOOLEAN,
                  description:
                    'True only if the query image visually matches one of the provided REF_ARTWORK entries.',
                },
                matchedMonumentId: {
                  type: Type.STRING,
                  description:
                    'Exact id of the matching REF_ARTWORK, or empty string if isMatch is false.',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Visual match confidence from 0 to 100.',
                },
                visualEvidence: {
                  type: Type.STRING,
                  description:
                    'Observable visual features comparing query image to matched record or explaining why no match was found.',
                },
                detectedCategory: {
                  type: Type.STRING,
                  description: 'Statues, Reliefs, Monuments, or Unknown.',
                },
              },
              required: ['isMatch', 'matchedMonumentId', 'confidence', 'visualEvidence'],
            },
          },
        });

        const jsonStr = (response.text ?? '{}').trim();
        const parsed = JSON.parse(jsonStr);
        const matched = parsed.matchedMonumentId
          ? MONUMENTS.find((m) => m.id === parsed.matchedMonumentId)
          : undefined;
        const isIndexedCandidate = matched ? PRIMARY_REF_BY_MONUMENT_ID.has(matched.id) : false;
        const confidenceNum = Number(parsed.confidence) || 0;

        if (!parsed.isMatch || !matched || !isIndexedCandidate || confidenceNum < 45) {
          return res.json({
            success: true,
            matched: false,
            message:
              parsed.visualEvidence ||
              `No matching artwork was confirmed across the ${PRIMARY_REF_BY_MONUMENT_ID.size} visually indexed Venice Survey123 artworks.`,
          });
        }

        return res.json({
          success: true,
          matched: true,
          match: {
            monument: matched,
            confidence: Math.min(99, Math.max(45, confidenceNum)),
            visualEvidence:
              parsed.visualEvidence ||
              `Visual features align with ${matched.regionDisplay} Survey123 record ${matched.surveyCode}.`,
            detectedCategory: parsed.detectedCategory || matched.category,
            engine: 'Gemini 4 Multimodal Visual Matcher',
          },
        });
      } catch (geminiError: any) {
        lastGeminiError = geminiError;
        console.warn(`Gemini multimodal attempt ${attempt + 1} failed:`, geminiError?.message);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    return res.status(502).json({
      success: false,
      error:
        lastGeminiError?.message ||
        'Gemini visual recognition request failed. Please check your connection and try again.',
    });
  } catch (error: any) {
    console.error('Error in /api/lens/recognize:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process image recognition',
      details: error?.message,
    });
  }
});

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ...(disableHmr ? { watch: null } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.on('error', (err) => {
    console.error('PreserVenice server error:', err);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PreserVenice server running on port ${PORT}`);
    setImmediate(() => {
      try {
        ensureSurveyReferenceImagesIndexed();
      } catch (err) {
        console.error('Failed to index Survey123 reference images:', err);
      }
    });
  });
}

// Vercel imports the Express app as a serverless function; local/Cloud Run deployments start the listener.
if (process.env.VERCEL !== '1') {
  start().catch((err) => {
    console.error('Failed to start PreserVenice server:', err);
    process.exit(1);
  });
}

export default app;
