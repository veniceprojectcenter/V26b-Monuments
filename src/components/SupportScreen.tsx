import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle } from 'lucide-react';
import { REGIONAL_COLLECTIONS } from '../data/monuments';

interface SupportScreenProps {
  onOpenFieldSurvey: () => void;
  onOpenGisMap?: () => void;
  initialOpenDonationCollectionId?: string | null;
  onConsumeInitialDonation?: () => void;
}

const COLLECTION_DONATION_CARDS = REGIONAL_COLLECTIONS.map((col) => ({
  id: col.id,
  name: col.title,
  description: col.description,
}));

export const SupportScreen: React.FC<SupportScreenProps> = ({
  onOpenFieldSurvey,
  initialOpenDonationCollectionId = null,
  onConsumeInitialDonation,
}) => {
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    initialOpenDonationCollectionId
  );
  const [donationInputs, setDonationInputs] = useState<Record<string, string>>({});
  const [currencies, setCurrencies] = useState<Record<string, 'USD' | 'EUR'>>({});
  const [pledgeSuccess, setPledgeSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpenDonationCollectionId) {
      setActiveCollectionId(initialOpenDonationCollectionId);
      onConsumeInitialDonation?.();
    }
  }, [initialOpenDonationCollectionId, onConsumeInitialDonation]);

  const handleOpenDonateField = (collectionId: string) => {
    setActiveCollectionId((prev) => (prev === collectionId ? null : collectionId));
  };

  const handleConfirmDonation = (collectionId: string, collectionName: string) => {
    const raw = (donationInputs[collectionId] || '').trim();
    const numeric = Number(raw);
    const currency = currencies[collectionId] || 'USD';
    const symbol = currency === 'EUR' ? '€' : '$';
    const label =
      raw && !Number.isNaN(numeric) && numeric > 0
        ? `${symbol}${numeric} (${currency}) to ${collectionName}`
        : collectionName;
    setPledgeSuccess(label);
    setActiveCollectionId(null);
    setDonationInputs((prev) => ({ ...prev, [collectionId]: '' }));
    setTimeout(() => setPledgeSuccess(null), 3500);
  };

  return (
    <div className="pt-4 pb-24 px-4 sm:px-6 max-w-4xl mx-auto w-full animate-in fade-in duration-200">
      {/* Header */}
      <div className="mb-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight">
          PreserVenice: Preserving Public Art
        </h1>
      </div>

      {/* Red divider rule */}
      <div className="border-t-2 border-[#b91c1c] mb-6"></div>

      {/* 1. Citizen Science Field Survey Section (Top) */}
      <div className="bg-[#111827] text-white p-5 sm:p-6 rounded-3xl mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Camera className="w-4 h-4 text-[#ef4444]" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-red-300">
            CITIZEN GIS SURVEY
          </span>
        </div>

        <h3 className="font-display font-bold text-lg sm:text-xl text-white">
          Spot an Uncataloged Statue, Relief, or Monument in Venice?
        </h3>
        <p className="text-xs sm:text-sm text-gray-300 mt-1 leading-relaxed">
          Record up-to-date information directly with our streamlined 4-field survey: upload an image, capture GPS location, select artwork type (statue, relief, or monument), and provide field notes.
        </p>

        <button
          onClick={onOpenFieldSurvey}
          className="mt-4 w-full bg-[#b91c1c] hover:bg-[#991b1b] text-white py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-sm cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Launch 4-Field Citizen Survey</span>
        </button>
      </div>

      {/* 2. Collection Donation Boxes (Between CITIZEN GIS SURVEY and UNESCO) */}
      <div className="space-y-3 mb-6">
        {pledgeSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Thank you for supporting {pledgeSuccess}!</span>
          </div>
        )}

        {COLLECTION_DONATION_CARDS.map((col) => {
          const isEditing = activeCollectionId === col.id;
          const selectedCurrency = currencies[col.id] || 'USD';
          return (
            <div
              key={col.id}
              className="bg-white p-4 rounded-xl border border-[#e5e7eb] shadow-2xs space-y-3"
            >
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-[#111827]">
                    {col.name}
                  </div>
                  <div className="text-xs text-[#6b7280]">
                    {col.description}
                  </div>
                </div>

                <button
                  type="button"
                  aria-expanded={isEditing}
                  onClick={() => handleOpenDonateField(col.id)}
                  className="shrink-0 min-h-[40px] px-4 py-2 bg-[#b91c1c] hover:bg-[#991b1b] text-xs font-bold text-white rounded-lg transition active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  Donate Now
                </button>
              </div>

              {isEditing && (
                <div className="pt-2 border-t border-[#f3f4f6] flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <select
                    value={selectedCurrency}
                    onChange={(e) =>
                      setCurrencies((prev) => ({
                        ...prev,
                        [col.id]: e.target.value as 'USD' | 'EUR',
                      }))
                    }
                    aria-label={`Currency for ${col.name}`}
                    className="bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-2.5 py-2 text-base sm:text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c] cursor-pointer shrink-0"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={donationInputs[col.id] || ''}
                    onChange={(e) =>
                      setDonationInputs((prev) => ({
                        ...prev,
                        [col.id]: e.target.value,
                      }))
                    }
                    placeholder="Enter contribution amount"
                    aria-label={`Donation amount for ${col.name}`}
                    className="min-w-0 flex-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-3 py-2 text-base sm:text-xs text-[#111827] placeholder-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#b91c1c]/30 focus:border-[#b91c1c]"
                  />

                  <button
                    type="button"
                    onClick={() => handleConfirmDonation(col.id, col.name)}
                    className="shrink-0 min-h-[40px] px-4 py-2 bg-black hover:bg-[#191c1e] text-white text-xs font-bold rounded-lg transition active:scale-95 cursor-pointer"
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. UNESCO Endorsement Card (Bottom) */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-5 flex flex-col justify-between shadow-2xs">
        <div>
          <div className="flex items-center gap-3 mb-4">
            {/* UNESCO Emblem representation */}
            <div className="border border-black p-2 rounded flex flex-col items-center justify-center text-center">
              <div className="text-[18px] font-black tracking-widest leading-none">UNESCO</div>
              <div className="text-[8px] font-serif uppercase tracking-tighter text-[#4b5563] mt-0.5">
                United Nations Cultural Organization
              </div>
            </div>
            <div className="border-l border-gray-300 pl-3">
              <div className="text-[10px] text-[#6b7280]">With the support of</div>
              <div className="text-sm font-bold text-[#111827]">Venice Office</div>
            </div>
          </div>
          <p className="text-xs text-[#4b5563] leading-relaxed">
            PreserVenice collaborates with local institutions and cultural heritage authorities under the guidance and support of the UNESCO Venice Office to safeguard Venetian street art patrimony.
          </p>
        </div>

        <div className="pt-4 mt-4 border-t border-[#f3f4f6] flex items-center justify-between text-xs">
          <span className="text-[#6b7280]">Official Partner</span>
          <span className="font-bold text-[#b91c1c]">Venice Lagoon Office</span>
        </div>
      </div>
    </div>
  );
};
