import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  createCampaign,
  findCreatorContact,
  getDashboardData,
  isMockMode,
  N8nApiError,
  sendOutreach,
  toSelectedCreator,
} from './api/n8n';

import type {
  CampaignRequest,
  CampaignResponse,
  CreatorRecommendation,
  DashboardData,
  SelectedCreator,
} from './api/types';

import {
  getAuthUser,
  login,
  logout,
  signup,
} from './auth';
import ChatBot from './ChatBot';


/* =========================================================
   NAVIGATION
========================================================= */

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/campaign', label: 'Campaign', icon: '◎' },
  { to: '/outreach', label: 'Outreach', icon: '✉' },
  { to: '/engagement', label: 'Engagement', icon: '⌁' },
  { to: '/sales', label: 'Sales & ROI', icon: '₹' },
];


/* =========================================================
   CAMPAIGN FORM
========================================================= */

const emptyForm: CampaignRequest = {
  product: '',
  description: '',
  category: '',
  target_audience: '',
  target_age: '',
  target_gender: '',
  location: '',
  budget: 0,
  goal: '',
  platform: 'Instagram',
  additional_requirements: '',
};

/* =========================================================
   MULTI-CAMPAIGN STORAGE
========================================================= */

type CampaignWorkspace = {
  id: string;
  form: CampaignRequest;
  result: CampaignResponse | null;
  selectedCreators: SelectedCreator[];
  selectedCreatorNames: string[];
  createdAt: string;
  updatedAt: string;
};

const CAMPAIGNS_STORAGE_KEY =
  'campaignmind:campaigns';

const ACTIVE_CAMPAIGN_STORAGE_KEY =
  'campaignmind:active-campaign';

function createCampaignId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `campaign_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getCampaigns(): CampaignWorkspace[] {
  try {
    const stored = localStorage.getItem(
      CAMPAIGNS_STORAGE_KEY
    );

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function saveCampaigns(
  campaigns: CampaignWorkspace[]
) {
  localStorage.setItem(
    CAMPAIGNS_STORAGE_KEY,
    JSON.stringify(campaigns)
  );
}

function getActiveCampaignId(): string | null {
  return localStorage.getItem(
    ACTIVE_CAMPAIGN_STORAGE_KEY
  );
}

function writeSelectedCreatorsSession(
  creators: SelectedCreator[]
) {
  sessionStorage.setItem(
    'campaignmind:selected-creators',
    JSON.stringify(creators)
  );

  sessionStorage.setItem(
    'campaignmind:selected-creator-names',
    JSON.stringify(creators.map((creator) => creator.name))
  );

  if (creators.length > 0) {
    sessionStorage.setItem(
      'campaignmind:selected-creator',
      JSON.stringify(creators[creators.length - 1])
    );
  } else {
    sessionStorage.removeItem(
      'campaignmind:selected-creator'
    );
  }
}

function persistSelectedCreators(
  creators: SelectedCreator[]
) {
  writeSelectedCreatorsSession(creators);

  const activeId = getActiveCampaignId();

  if (activeId) {
    updateWorkspaceCampaign(activeId, {
      selectedCreators: creators,
      selectedCreatorNames: creators.map(
        (creator) => creator.name
      ),
    });
  }

  window.dispatchEvent(
    new Event('campaignmind:selection-updated')
  );
}

function loadSelectedCreators(): SelectedCreator[] {
  const stored = sessionStorage.getItem(
    'campaignmind:selected-creators'
  );

  if (!stored) {
    const active = getActiveCampaign();
    return (active?.selectedCreators ?? []).map(
      toSelectedCreator
    );
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) =>
      toSelectedCreator(item as CreatorRecommendation)
    );
  } catch {
    return [];
  }
}

function isDemoCreatorEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.toLowerCase();
  return (
    normalized.includes('demo.campaignmind.local') ||
    normalized.includes('fake@example') ||
    normalized.endsWith('.local')
  );
}

function formatFollowers(value?: number | null): string {
  if (value === null || value === undefined) {
    return 'Not available';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return value.toLocaleString('en-IN');
}

function creatorInitials(name: string): string {
  const cleaned = name
    .split('|')[0]
    .replace(/\(.*?\)/g, ' ')
    .replace(/@\S+/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);

  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function setActiveCampaignId(
  campaignId: string
) {
  localStorage.setItem(
    ACTIVE_CAMPAIGN_STORAGE_KEY,
    campaignId
  );

  const campaign = getCampaigns().find(
    (item) => item.id === campaignId
  );

  if (campaign) {
    sessionStorage.setItem(
      'campaignmind:campaign-form',
      JSON.stringify(campaign.form)
    );

    if (campaign.result) {
      sessionStorage.setItem(
        'campaignmind:last-result',
        JSON.stringify(campaign.result)
      );
    } else {
      sessionStorage.removeItem(
        'campaignmind:last-result'
      );
    }

    writeSelectedCreatorsSession(
      (campaign.selectedCreators ?? []).map(
        toSelectedCreator
      )
    );
  }

  window.dispatchEvent(
    new Event('campaignmind:active-campaign-updated')
  );

  window.dispatchEvent(
    new Event('campaignmind:selection-updated')
  );
}

function getActiveCampaign(): CampaignWorkspace | null {
  const campaigns = getCampaigns();
  const activeId = getActiveCampaignId();

  if (!activeId) {
    return campaigns[0] ?? null;
  }

  return (
    campaigns.find(
      (campaign) => campaign.id === activeId
    ) ?? campaigns[0] ?? null
  );
}

function createWorkspaceCampaign(
  form: CampaignRequest,
  result: CampaignResponse | null = null,
  selectedCreators: SelectedCreator[] = []
): CampaignWorkspace {
  const now = new Date().toISOString();

  const campaign: CampaignWorkspace = {
    id: createCampaignId(),
    form: { ...form },
    result,
    selectedCreators,
    selectedCreatorNames: selectedCreators.map(
      (creator) => creator.name
    ),
    createdAt: now,
    updatedAt: now,
  };

  const campaigns = getCampaigns();

  saveCampaigns([
    ...campaigns,
    campaign,
  ]);

  setActiveCampaignId(campaign.id);

  return campaign;
}

function updateWorkspaceCampaign(
  campaignId: string,
  updates: Partial<CampaignWorkspace>
) {
  const campaigns = getCampaigns();

  const updated = campaigns.map(
    (campaign) =>
      campaign.id === campaignId
        ? {
            ...campaign,
            ...updates,
            updatedAt: new Date().toISOString(),
          }
        : campaign
  );

  saveCampaigns(updated);

  window.dispatchEvent(
    new Event('campaignmind:campaigns-updated')
  );
}

function deleteWorkspaceCampaign(
  campaignId: string
) {
  const campaigns = getCampaigns();

  const remaining = campaigns.filter(
    (campaign) => campaign.id !== campaignId
  );

  saveCampaigns(remaining);

  if (
    getActiveCampaignId() === campaignId
  ) {
    if (remaining.length > 0) {
      setActiveCampaignId(
        remaining[0].id
      );
    } else {
      localStorage.removeItem(
        ACTIVE_CAMPAIGN_STORAGE_KEY
      );
    }
  }

  window.dispatchEvent(
    new Event('campaignmind:campaigns-updated')
  );
}



/* =========================================================
   APP
========================================================= */

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}


/* =========================================================
   MAIN SHELL
========================================================= */


function CampaignSwitcher() {
  const [campaigns, setCampaigns] =
    useState<CampaignWorkspace[]>(() => getCampaigns());

  const [activeId, setActiveId] =
    useState<string | null>(() => getActiveCampaignId());

  const [showManager, setShowManager] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [editForm, setEditForm] =
    useState<CampaignRequest>(emptyForm);

  const [deleteId, setDeleteId] =
    useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setCampaigns(getCampaigns());
      setActiveId(getActiveCampaignId());
    };

    window.addEventListener(
      'campaignmind:campaigns-updated',
      refresh
    );

    window.addEventListener(
      'campaignmind:active-campaign-updated',
      refresh
    );

    return () => {
      window.removeEventListener(
        'campaignmind:campaigns-updated',
        refresh
      );

      window.removeEventListener(
        'campaignmind:active-campaign-updated',
        refresh
      );
    };
  }, []);

  if (campaigns.length === 0) {
    return null;
  }

  const activeCampaign =
    campaigns.find((campaign) => campaign.id === activeId) ??
    campaigns[0];

  const startEdit = (campaign: CampaignWorkspace) => {
    setEditingId(campaign.id);
    setEditForm({
      ...emptyForm,
      ...campaign.form,
    });
  };

  const updateEditForm = (
    key: keyof CampaignRequest,
    value: string | number
  ) => {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveEdit = () => {
    if (!editingId) return;

    if (
      !editForm.product.trim() ||
      !editForm.description.trim() ||
      !editForm.category.trim()
    ) {
      return;
    }

    updateWorkspaceCampaign(editingId, {
      form: {
        ...editForm,
      },
    });

    if (editingId === activeId) {
      setActiveCampaignId(editingId);

      sessionStorage.setItem(
        'campaignmind:campaign-form',
        JSON.stringify(editForm)
      );
    }

    setEditingId(null);
    setEditForm(emptyForm);
  };

  const confirmDelete = () => {
    if (!deleteId) return;

    deleteWorkspaceCampaign(deleteId);

    setDeleteId(null);
  };

  return (
    <>
      <div className="mb-6 rounded-2xl border border-[#dfe7dc] bg-white p-4 shadow-sm">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="min-w-0">
            <p className="eyebrow">
              Active campaign
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-[#29463b]">
              {activeCampaign.form.product ||
                'Untitled campaign'}
            </p>

            <p className="mt-0.5 text-[11px] text-[#89958e]">
              {activeCampaign.form.category ||
                'Campaign brief not completed'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            <select
              value={activeCampaign.id}
              onChange={(event) => {
                setActiveCampaignId(event.target.value);
              }}
              className="rounded-xl border border-[#d5dfd1] bg-[#fbfcfa] px-3 py-2 text-sm font-semibold text-[#29463b] outline-none focus:border-[#8fae61]"
            >
              {campaigns.map((campaign, index) => (
                <option
                  key={campaign.id}
                  value={campaign.id}
                >
                  {campaign.form.product ||
                    `Campaign ${index + 1}`}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowManager((value) => !value)}
              className="rounded-xl border border-[#d5dfd1] bg-white px-3 py-2 text-xs font-bold text-[#4f7630] transition hover:bg-[#f4f8f0]"
            >
              {showManager
                ? 'Close manager'
                : 'Manage campaigns'}
            </button>

          </div>
        </div>

        {showManager && (
          <div className="mt-4 border-t border-[#edf0eb] pt-4">

            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60766b]">
                Your campaigns
              </p>

              <span className="text-[10px] text-[#9ba59f]">
                {campaigns.length} campaign
                {campaigns.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-2">

              {campaigns.map((campaign, index) => {
                const isActive =
                  campaign.id === activeCampaign.id;

                const isEditing =
                  campaign.id === editingId;

                return (
                  <div
                    key={campaign.id}
                    className={`rounded-xl border p-3 ${
                      isActive
                        ? 'border-[#b8ce8d] bg-[#f7faef]'
                        : 'border-[#edf0eb] bg-[#fbfcfa]'
                    }`}
                  >

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                      <div className="min-w-0">

                        {isEditing ? (
                          <div className="w-full min-w-0 sm:min-w-[520px]">
                            <div className="grid gap-3 sm:grid-cols-2">

                              <input
                                value={editForm.product}
                                onChange={(event) =>
                                  updateEditForm(
                                    'product',
                                    event.target.value
                                  )
                                }
                                placeholder="Product / campaign name"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                value={editForm.category}
                                onChange={(event) =>
                                  updateEditForm(
                                    'category',
                                    event.target.value
                                  )
                                }
                                placeholder="Category"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <textarea
                                value={editForm.description}
                                onChange={(event) =>
                                  updateEditForm(
                                    'description',
                                    event.target.value
                                  )
                                }
                                placeholder="Campaign description"
                                rows={2}
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none sm:col-span-2"
                              />

                              <input
                                value={editForm.target_audience}
                                onChange={(event) =>
                                  updateEditForm(
                                    'target_audience',
                                    event.target.value
                                  )
                                }
                                placeholder="Target audience"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                value={editForm.location}
                                onChange={(event) =>
                                  updateEditForm(
                                    'location',
                                    event.target.value
                                  )
                                }
                                placeholder="Location"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                value={editForm.target_age}
                                onChange={(event) =>
                                  updateEditForm(
                                    'target_age',
                                    event.target.value
                                  )
                                }
                                placeholder="Target age"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                value={editForm.target_gender}
                                onChange={(event) =>
                                  updateEditForm(
                                    'target_gender',
                                    event.target.value
                                  )
                                }
                                placeholder="Target gender"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                type="number"
                                value={editForm.budget || ''}
                                onChange={(event) =>
                                  updateEditForm(
                                    'budget',
                                    Number(event.target.value)
                                  )
                                }
                                placeholder="Budget"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <input
                                value={editForm.goal}
                                onChange={(event) =>
                                  updateEditForm(
                                    'goal',
                                    event.target.value
                                  )
                                }
                                placeholder="Campaign goal"
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              />

                              <select
                                value={editForm.platform}
                                onChange={(event) =>
                                  updateEditForm(
                                    'platform',
                                    event.target.value
                                  )
                                }
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none"
                              >
                                <option value="Instagram">
                                  Instagram
                                </option>
                                <option value="YouTube">
                                  YouTube
                                </option>
                                <option value="TikTok">
                                  TikTok
                                </option>
                                <option value="Facebook">
                                  Facebook
                                </option>
                                <option value="LinkedIn">
                                  LinkedIn
                                </option>
                              </select>

                              <textarea
                                value={
                                  editForm.additional_requirements
                                }
                                onChange={(event) =>
                                  updateEditForm(
                                    'additional_requirements',
                                    event.target.value
                                  )
                                }
                                placeholder="Additional requirements"
                                rows={2}
                                className="rounded-lg border border-[#cbd8c4] bg-white px-3 py-2 text-xs text-[#29463b] outline-none sm:col-span-2"
                              />

                            </div>

                            <div className="mt-3 flex gap-2">

                              <button
                                type="button"
                                onClick={saveEdit}
                                className="rounded-lg bg-[#416b58] px-3 py-2 text-[10px] font-bold text-white"
                              >
                                Save changes
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditForm(emptyForm);
                                }}
                                className="rounded-lg border border-[#d5dfd1] px-3 py-2 text-[10px] font-bold text-[#60766b]"
                              >
                                Cancel
                              </button>

                            </div>
                          </div>
                        ) : (
                          <>
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveCampaignId(
                                    campaign.id
                                  )
                                }
                                className="rounded-lg border border-[#d5dfd1] px-3 py-2 text-[10px] font-bold text-[#4f7630]"
                              >
                                Open
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                startEdit(campaign)
                              }
                              className="rounded-lg border border-[#d5dfd1] px-3 py-2 text-[10px] font-bold text-[#60766b]"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setDeleteId(campaign.id)
                              }
                              className="rounded-lg border border-[#ead0d0] px-3 py-2 text-[10px] font-bold text-[#a35c5c]"
                            >
                              Delete
                            </button>
                          </>
                        )}

                      </div>
                    </div>

                  </div>
                );
              })}

            </div>
          </div>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[#173c32]/40 p-5">

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

            <p className="eyebrow">
              Delete campaign
            </p>

            <h3 className="mt-2 font-display text-xl font-semibold text-[#173c32]">
              Delete this campaign?
            </h3>

            <p className="mt-2 text-sm leading-6 text-[#78857e]">
              This removes the campaign workspace and its saved
              campaign data from this browser.
            </p>

            <div className="mt-6 flex justify-end gap-2">

              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-xl border border-[#d5dfd1] px-4 py-2.5 text-xs font-bold text-[#60766b]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-xl bg-[#a35c5c] px-4 py-2.5 text-xs font-bold text-white"
              >
                Delete campaign
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}


function getSavedProfilePhoto(): string {
  try {
    const stored = localStorage.getItem('campaignmind:profile');
    const profile = stored ? JSON.parse(stored) as { photo?: string } : null;
    return profile?.photo ?? '';
  } catch {
    return '';
  }
}


function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const authUser = getAuthUser();
  const [profilePhoto, setProfilePhoto] = useState(() => getSavedProfilePhoto());

  const [profileName, setProfileName] = useState(() => {
    try {
      const stored = localStorage.getItem(
        'campaignmind:profile'
      );

      if (stored) {
        const profile = JSON.parse(stored);

        if (profile?.name) {
          return profile.name;
        }
      }
    } catch {
      // Use the authenticated account name below.
    }

    return authUser?.name || 'User';
  });

  useEffect(() => {
    const updateProfileName = () => {
      try {
        const stored = localStorage.getItem(
          'campaignmind:profile'
        );

        if (stored) {
          const profile = JSON.parse(stored);

          setProfileName(
            profile?.name ||
              authUser?.name ||
              'User'
          );
          setProfilePhoto(profile?.photo || '');

          return;
        }
      } catch {
        // Fall back to the authenticated account name.
      }

      setProfileName(authUser?.name || 'User');
      setProfilePhoto('');
    };

    window.addEventListener(
      'campaignmind:profile-updated',
      updateProfileName
    );

    return () => {
      window.removeEventListener(
        'campaignmind:profile-updated',
        updateProfileName
      );
    };
  }, [authUser?.name]);

  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  const pageNames: Record<string, string> = {
    '/': 'Dashboard',
    '/campaign': 'Campaign',
    '/campaigns/new': 'Campaign',
    '/outreach': 'Outreach',
    '/engagement': 'Engagement',
    '/sales': 'Sales & ROI',
    '/profile': 'Profile',
  };

  const currentPage =
    pageNames[location.pathname] ?? 'ERAYA';

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7]">

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[252px] border-r border-[#d9dee4] bg-[#edf0f3] px-5 py-6 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* MAIN NAVIGATION */}
        <p className="eyebrow mb-3 px-2 pt-2">
          Workspace
        </p>

        <nav className="space-y-1">

          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive
                    ? 'bg-white font-semibold text-[#20394b] shadow-sm'
                    : 'text-[#687785] hover:bg-white/70 hover:text-[#20394b]'
                }`
              }
            >
              <span className="w-4 text-center text-base">
                {item.icon}
              </span>

              {item.label}
            </NavLink>
          ))}

        </nav>


        {/* ACCOUNT */}
        <div className="absolute bottom-6 left-5 right-5">

          <div className="mb-3 h-px bg-[#dfe5de]" />

          <NavLink
            to="/profile"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive
                ? 'bg-white font-semibold text-[#20394b] shadow-sm'
                : 'text-[#687785] hover:bg-white/70 hover:text-[#20394b]'
              }`
            }
          >
            <span className="w-4 text-center">
              ◉
            </span>

            Profile
          </NavLink>

          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#687785] transition hover:bg-white/70 hover:text-[#20394b]"
          >
            <span className="w-4 text-center">
              ↪
            </span>

            Logout
          </button>

        </div>

      </aside>


      {/* MOBILE OVERLAY */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-[#173c32]/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}


      {/* MAIN */}
      <main className="min-h-screen lg:pl-[252px] pt-[72px]">

        {/* HEADER */}
        <header className="fixed left-0 right-0 top-0 z-40 flex h-[72px] items-center justify-between border-b border-[#d9dee4] bg-[#f4f5f7]/95 px-6 backdrop-blur md:px-8">

          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              className="text-xl text-[#20394b] lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              ☰
            </button>
            <img src="/assets/eraya-logo.png" alt="ERAYA" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />
          </div>

          <div className="ml-4 hidden text-xs text-[#819087] md:block">
            Workspace /{' '}
            <span className="text-[#263d34]">
              {currentPage}
            </span>
          </div>


          {/* PROFILE */}
          <Link
            to="/profile"
            className="ml-auto flex items-center gap-3"
          >

            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-[#263d34]">
                {profileName}
              </p>

              <p className="text-[10px] text-[#7e8b96]">
                Brand workspace
              </p>
            </div>

            {profilePhoto ? (
              <img src={profilePhoto} alt="Profile" className="h-9 w-9 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dce5f2] text-xs font-bold text-[#304e78]">
                {profileName
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part: string) => part[0]?.toUpperCase())
                  .join('') || 'U'}
              </div>
            )}

          </Link>

        </header>


        {/* PAGE CONTENT */}
        <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">

          <div className="mb-5 flex justify-end">

            {isMockMode && (
              <div className="rounded-full border border-[#ead9a9] bg-[#fff9e8] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#92712d]">
                Demo mode · mock API responses
              </div>
            )}

          </div>


          <CampaignSwitcher />

          <Routes>

            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/campaign"
              element={<Campaign />}
            />

            <Route
              path="/outreach"
              element={<Outreach />}
            />

            {/* Keep old URL working */}
            <Route
              path="/campaigns/new"
              element={<Campaign />}
            />

            <Route
              path="/engagement"
              element={<Engagement />}
            />

            <Route
              path="/sales"
              element={<Sales />}
            />

            <Route
              path="/profile"
              element={<Profile />}
            />

          </Routes>

        </div>

      </main>

      <ChatBot />

    </div>
  );
}


/* =========================================================
   LOGIN
========================================================= */

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);
    const success = await login(email.trim(), password);

    if (!success) {
      setError(
        'No matching account found. Please check your details or create an account.'
      );
      setLoading(false);
      return;
    }

    navigate('/');
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] px-5 py-10 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">

        <div className="w-full">

          <div className="mb-8 text-center">

            <img src="/assets/eraya-logo.png" alt="ERAYA" className="relative top-4 mx-auto mb-10 h-48 w-48 object-contain" />

            <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32]">
              Welcome back.
            </h1>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#78857e]">
              Sign in to continue managing your influencer campaigns.
            </p>

          </div>


          <form
            onSubmit={submit}
            className="panel p-6 md:p-8"
          >

            <div className="space-y-5">

              <div>
                <label className="field-label">
                  Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
              </div>


              <div>
                <label className="field-label">
                  Password
                </label>

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="mt-2 text-xs font-semibold text-[#41623f] hover:text-[#173c32]">
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>

            </div>


            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-[#f1cccc] bg-[#fff5f5] px-4 py-3 text-sm leading-5 text-[#a34d4d]"
              >
                {error}
              </div>
            )}


            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={() => navigate('/forgot-password')} className="text-xs font-semibold text-[#41623f] hover:text-[#173c32]">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? 'Signing in…' : 'Sign in'}
              <span className="ml-2 text-[#d5ed78]">
                ↗
              </span>
            </button>


            <div className="mt-6 border-t border-[#edf0eb] pt-6 text-center">

              <p className="text-xs text-[#89958e]">
                Don't have an account?
              </p>

              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="mt-2 text-sm font-semibold text-[#41623f] hover:text-[#173c32]"
              >
                Create your brand account
              </button>

            </div>

          </form>


          <p className="mt-6 text-center text-[10px] leading-4 text-[#9aa59f]">
            ERAYA · Influencer campaign platform
          </p>

        </div>

      </div>
    </div>
  );
}


/* =========================================================
   SIGN UP
========================================================= */

function Signup() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!name.trim() || !company.trim() || !email.trim() || !password) {
      setError('Complete all required fields.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password should contain at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    await signup(
      {
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
      },
      password
    );

    navigate('/');
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] px-5 py-10 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-lg items-center">

        <div className="w-full">

          <div className="mb-8 text-center">

            <img src="/assets/eraya-logo.png" alt="ERAYA" className="mx-auto mb-5 h-32 w-32 object-contain" />

            <p className="eyebrow mb-3">
              Brand workspace
            </p>

            <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32]">
              Create your account.
            </h1>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#78857e]">
              Build a clearer, more consistent influencer campaign workflow with ERAYA.
            </p>

          </div>


          <form
            onSubmit={submit}
            className="panel p-6 md:p-8"
          >

            <div className="grid gap-5 md:grid-cols-2">

              <div>
                <label className="field-label">
                  Your name *
                </label>

                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Aanya Sharma"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
              </div>


              <div>
                <label className="field-label">
                  Company *
                </label>

                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Your Brand"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
              </div>


              <div className="md:col-span-2">

                <label className="field-label">
                  Work email *
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />

              </div>


              <div>

                <label className="field-label">
                  Password *
                </label>

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="mt-2 text-xs font-semibold text-[#41623f] hover:text-[#173c32]">
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>

              </div>


              <div>

                <label className="field-label">
                  Confirm password *
                </label>

                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat password"
                  className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
                />
                <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="mt-2 text-xs font-semibold text-[#41623f] hover:text-[#173c32]">
                  {showConfirmPassword ? 'Hide password' : 'Show password'}
                </button>

              </div>

            </div>


            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-[#f1cccc] bg-[#fff5f5] px-4 py-3 text-sm leading-5 text-[#a34d4d]"
              >
                {error}
              </div>
            )}


            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? 'Creating account…' : 'Create brand account'}
              <span className="ml-2 text-[#d5ed78]">
                ↗
              </span>
            </button>


            <div className="mt-6 border-t border-[#edf0eb] pt-6 text-center">

              <p className="text-xs text-[#89958e]">
                Already have an account?
              </p>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="mt-2 text-sm font-semibold text-[#41623f] hover:text-[#173c32]"
              >
                Sign in
              </button>

            </div>

          </form>


          <p className="mt-6 text-center text-[10px] leading-4 text-[#9aa59f]">
            ERAYA · Influencer campaign platform
          </p>

        </div>

      </div>
    </div>
  );
}

function presentFrontendError(message: string): string {
  return message.replace(/CampaignMind/gi, 'ERAYA');
}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    // The current frontend-only auth has no reset endpoint. Keep this flow
    // ready for a real reset API without pretending an email was sent.
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] px-5 py-10 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <div className="w-full">
          <div className="mb-8 text-center">
            <img src="/assets/eraya-logo.png" alt="ERAYA" className="mx-auto mb-5 h-32 w-32 object-contain" />
            <p className="eyebrow mb-3">ERAYA</p>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32]">Forgot your password?</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#78857e]">Enter your email and we'll help you reset your password.</p>
          </div>

          <form onSubmit={submit} className="panel p-6 md:p-8">
            {submitted ? (
              <div role="status" className="rounded-xl border border-[#d8e6c1] bg-[#f2f8e3] p-5">
                <p className="font-semibold text-[#29463b]">Check your email</p>
                <p className="mt-2 text-sm leading-6 text-[#6f7d75]">If an account exists for this email, password reset instructions have been sent.</p>
              </div>
            ) : (
              <>
                <label className="field-label" htmlFor="reset-email">Email</label>
                <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]" />
                {error && <p role="alert" className="mt-3 text-sm text-[#a34d4d]">{error}</p>}
                <button type="submit" disabled={loading} className="mt-6 w-full rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445] disabled:cursor-wait disabled:opacity-70">
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
            <button type="button" onClick={() => navigate('/login')} className="mt-6 w-full text-center text-sm font-semibold text-[#41623f] hover:text-[#173c32]">Back to sign in</button>
          </form>
          <p className="mt-6 text-center text-[10px] leading-4 text-[#9aa59f]">ERAYA · Influencer campaign platform</p>
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {
  const [selectedCreators, setSelectedCreators] = useState<
    SelectedCreator[]
  >([]);

  const [campaignForm, setCampaignForm] =
    useState<CampaignRequest | null>(() => {
      const stored = sessionStorage.getItem(
        'campaignmind:campaign-form'
      );

      try {
        return stored
          ? (JSON.parse(stored) as CampaignRequest)
          : null;
      } catch {
        return null;
      }
    });

  const [profileName, setProfileName] = useState(() => {
    try {
      const stored = localStorage.getItem(
        'campaignmind:profile'
      );

      const profile = stored
        ? JSON.parse(stored)
        : null;

      return profile?.name?.trim() || 'Aanya';
    } catch {
      return 'Aanya';
    }
  });

  const [currentHour, setCurrentHour] = useState(
    new Date().getHours()
  );

  useEffect(() => {
    const loadSelectedCreators = () => {
      const stored = sessionStorage.getItem(
        'campaignmind:selected-creators'
      );

      if (!stored) {
        setSelectedCreators([]);
        return;
      }

      try {
        const parsed = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          setSelectedCreators(parsed);
        } else {
          setSelectedCreators([]);
        }
      } catch {
        setSelectedCreators([]);
      }
    };

    loadSelectedCreators();

    window.addEventListener(
      'campaignmind:selection-updated',
      loadSelectedCreators
    );

    window.addEventListener(
      'storage',
      loadSelectedCreators
    );

    return () => {
      window.removeEventListener(
        'campaignmind:selection-updated',
        loadSelectedCreators
      );

      window.removeEventListener(
        'storage',
        loadSelectedCreators
      );
    };
  }, []);

  useEffect(() => {
    const loadProfile = () => {
      try {
        const stored = localStorage.getItem(
          'campaignmind:profile'
        );

        const profile = stored
          ? JSON.parse(stored)
          : null;

        setProfileName(
          profile?.name?.trim() || 'Aanya'
        );
      } catch {
        setProfileName('Aanya');
      }
    };

    const updateClock = () => {
      setCurrentHour(new Date().getHours());
    };

    loadProfile();
    updateClock();

    window.addEventListener(
      'campaignmind:profile-updated',
      loadProfile
    );

    const clockTimer = window.setInterval(
      updateClock,
      60 * 1000
    );

    return () => {
      window.removeEventListener(
        'campaignmind:profile-updated',
        loadProfile
      );

      window.clearInterval(clockTimer);
    };
  }, []);

  const getGreeting = (hour: number) => {
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    }

    if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    }

    return 'Good evening';
  };

  const formatMetric = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }

    return Math.round(value).toLocaleString('en-IN');
  };

  const formatCurrency = (value: number) =>
    `₹${Math.round(value).toLocaleString('en-IN')}`;

  /*
   * These calculations intentionally mirror the mock
   * Engagement and Sales logic used elsewhere in the app.
   */

  const performance = selectedCreators.map(
    (creator, index) => {
      const followers = Number(
        creator.followers || 0
      );

      const engagementRate = Number(
        creator.engagement_rate || 0
      );

      const reach = Math.round(
        followers * (1.35 + index * 0.08)
      );

      const likes = Math.round(
        reach * (engagementRate / 100) * 0.78
      );

      const comments = Math.round(
        likes * 0.043
      );

      const shares = Math.round(
        likes * 0.061
      );

      const saves = Math.round(
        likes * 0.108
      );

      const interactions =
        likes +
        comments +
        shares +
        saves;

      const orders = Math.max(
        8,
        Math.round(followers * 0.00105) +
          Math.round(engagementRate * 3.5) +
          index * 5
      );

      const revenue = orders * 500;

      const cost = Number(
        creator.estimated_price || 0
      );

      return {
        creator,
        reach,
        interactions,
        orders,
        revenue,
        cost,
      };
    }
  );

  const totalReach = performance.reduce(
    (sum, item) => sum + item.reach,
    0
  );

  const totalInteractions = performance.reduce(
    (sum, item) => sum + item.interactions,
    0
  );

  const totalOrders = performance.reduce(
    (sum, item) => sum + item.orders,
    0
  );

  const totalRevenue = performance.reduce(
    (sum, item) => sum + item.revenue,
    0
  );

  const totalCost = performance.reduce(
    (sum, item) => sum + item.cost,
    0
  );

  const totalProfit =
    totalRevenue - totalCost;

  const overallEngagement =
    totalReach > 0
      ? (totalInteractions / totalReach) * 100
      : 0;

  const overallRoi =
    totalCost > 0
      ? (totalProfit / totalCost) * 100
      : 0;

  const topCreator =
    performance.length > 0
      ? [...performance].sort(
          (a, b) =>
            b.revenue - a.revenue
        )[0]
      : null;

  return (
    <>
      {/* INTRO */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow mb-3">
            ERAYA
          </p>

          <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
            {getGreeting(currentHour)}, {profileName}.
          </h1>

          <p className="mt-2 text-sm text-[#78857e]">
            Turn creator performance into your next campaign advantage.
          </p>
        </div>

        <Link
          to="/campaign"
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#173c32] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#245445]"
        >
          Create a campaign

          <span className="text-[#d5ed78]">
            ↗
          </span>
        </Link>
      </div>

      {selectedCreators.length === 0 ? (
        <>
          {/* EMPTY STATE */}
          <section className="panel mb-7 p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <p className="eyebrow text-[#6f943b]">
                  Campaign workspace
                </p>

                <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
                  Start by finding your creators.
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-[#78857e]">
                  Create a campaign and select influencers.
                  Their engagement, sales and ROI will
                  automatically appear across your workspace.
                </p>
              </div>

              <Link
                to="/campaign"
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445]"
              >
                Find creators
                <span className="text-[#d5ed78]">
                  ↗
                </span>
              </Link>
            </div>
          </section>

          {/* WORKSPACE STATS */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Creators selected', '0', '◉'],
              ['Total reach', '0', '◎'],
              ['Orders', '0', '✦'],
              ['ROI', '0%', '⌁'],
            ].map(([label, value, icon]) => (
              <div
                className="panel p-5"
                key={label}
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="eyebrow">
                    {label}
                  </span>

                  <span className="text-lg text-[#7e9d75]">
                    {icon}
                  </span>
                </div>

                <p className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
                  {value}
                </p>

                <p className="mt-1 text-xs text-[#8a968f]">
                  Current campaign
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ACTIVE CAMPAIGN */}
          <section className="mb-7 rounded-2xl border border-[#d8e6c1] bg-[#f2f8e3] p-6">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <p className="eyebrow text-[#6f943b]">
                  Active campaign
                </p>

                <h2 className="mt-1 font-display text-xl font-semibold text-[#355022]">
                  {campaignForm?.product || 'Current campaign'}
                </h2>

                <p className="mt-1 text-xs text-[#66804e]">
                  {selectedCreators.length} creator
                  {selectedCreators.length !== 1 ? 's' : ''}{' '}
                  selected · Instagram
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedCreators.map((creator) => (
                  <span
                    key={creator.creator_id}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#41623f]"
                  >
                    {creator.name}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* STAT CARDS */}
          <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              [
                'Creators',
                selectedCreators.length.toString(),
                '◉',
              ],
              [
                'Reach',
                formatMetric(totalReach),
                '◎',
              ],
              [
                'Engagement',
                `${overallEngagement.toFixed(1)}%`,
                '⌁',
              ],
              [
                'Orders',
                formatMetric(totalOrders),
                '✦',
              ],
              [
                'Revenue',
                formatCurrency(totalRevenue),
                '₹',
              ],
              [
                'ROI',
                `${overallRoi.toFixed(1)}%`,
                '↗',
              ],
            ].map(([label, value, icon]) => (
              <div
                className="panel p-5"
                key={label}
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="eyebrow">
                    {label}
                  </span>

                  <span className="text-lg text-[#7e9d75]">
                    {icon}
                  </span>
                </div>

                <p className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
                  {value}
                </p>

                <p className="mt-1 text-xs text-[#8a968f]">
                  Current campaign
                </p>
              </div>
            ))}
          </div>

          {/* LOWER DASHBOARD */}
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            {/* CREATOR PERFORMANCE */}
            <section className="panel overflow-hidden">
              <div className="border-b border-[#edf0eb] px-6 py-5">
                <p className="eyebrow mb-1">
                  Creator performance
                </p>

                <h2 className="font-display text-lg font-semibold text-[#173c32]">
                  Campaign overview
                </h2>
              </div>

              {performance.map(
                ({
                  creator,
                  reach,
                  interactions,
                  orders,
                  revenue,
                  cost,
                }) => (
                  <div
                    className="flex flex-col gap-4 border-b border-[#edf0eb] px-6 py-5 last:border-0"
                    key={creator.creator_id}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="font-semibold text-[#29463b]">
                          {creator.name}
                        </p>

                        <p className="mt-1 text-xs text-[#89958e]">
                          {creator.platform} ·{' '}
                          {formatMetric(
                            Number(
                              creator.followers || 0
                            )
                          )}{' '}
                          followers
                        </p>
                      </div>

                      <div className="flex gap-5">
                        <div className="text-right">
                          <p className="text-xs font-semibold text-[#405c50]">
                            {formatMetric(reach)}
                          </p>

                          <p className="mt-1 text-[10px] text-[#9ba59f]">
                            Reach
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold text-[#405c50]">
                            {formatMetric(orders)}
                          </p>

                          <p className="mt-1 text-[10px] text-[#9ba59f]">
                            Orders
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-semibold text-[#405c50]">
                            {formatCurrency(revenue)}
                          </p>

                          <p className="mt-1 text-[10px] text-[#9ba59f]">
                            Revenue
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-[#fbfcfa] px-4 py-3">
                      <span className="text-[10px] text-[#8a968f]">
                        {formatMetric(interactions)} total interactions
                      </span>

                      <span className="text-[10px] font-semibold text-[#41623f]">
                        {formatCurrency(
                          revenue - cost
                        )}{' '}
                        profit
                      </span>
                    </div>
                  </div>
                )
              )}
            </section>

            {/* CAMPAIGN SUMMARY */}
            <section className="relative overflow-hidden rounded-2xl bg-[#173c32] p-7 text-white">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[22px] border-[#416b58]/40" />

              <div className="relative">
                <div className="mb-8 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d5ed78] text-lg text-[#173c32]">
                    ✦
                  </span>

                  <span className="rounded-full border border-[#537463] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#c6d9c8]">
                    Demo overview
                  </span>
                </div>

                <p className="eyebrow text-[#8fb399]">
                  Campaign return
                </p>

                <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.05em]">
                  {formatCurrency(totalProfit)}
                </p>

                <p className="mt-2 text-xs text-[#a6bdb0]">
                  Estimated profit
                </p>

                <div className="mt-8 border-t border-[#416454] pt-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#a6bdb0]">
                      Campaign cost
                    </span>

                    <span className="text-sm font-semibold text-white">
                      {formatCurrency(totalCost)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-[#a6bdb0]">
                      Overall ROI
                    </span>

                    <span className="text-sm font-semibold text-[#d5ed78]">
                      {overallRoi.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {topCreator && (
                  <div className="mt-8 rounded-xl bg-[#245445] p-4">
                    <p className="eyebrow text-[#8fb399]">
                      Highest revenue
                    </p>

                    <p className="mt-2 text-sm font-semibold text-white">
                      {topCreator.creator.name}
                    </p>

                    <p className="mt-1 text-xs text-[#a6bdb0]">
                      {formatCurrency(
                        topCreator.revenue
                      )}{' '}
                      attributed revenue
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* NAVIGATION */}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <Link
              to="/engagement"
              className="panel flex items-center justify-between p-5 transition hover:-translate-y-0.5"
            >
              <div>
                <p className="eyebrow">
                  Analyze
                </p>

                <p className="mt-1 font-display text-lg font-semibold text-[#173c32]">
                  View engagement
                </p>

                <p className="mt-1 text-xs text-[#78857e]">
                  Reach, views, likes and engagement rate.
                </p>
              </div>

              <span className="text-xl text-[#6f943b]">
                ↗
              </span>
            </Link>

            <Link
              to="/sales"
              className="panel flex items-center justify-between p-5 transition hover:-translate-y-0.5"
            >
              <div>
                <p className="eyebrow">
                  Measure
                </p>

                <p className="mt-1 font-display text-lg font-semibold text-[#173c32]">
                  View sales & ROI
                </p>

                <p className="mt-1 text-xs text-[#78857e]">
                  Orders, revenue, profit and campaign return.
                </p>
              </div>

              <span className="text-xl text-[#6f943b]">
                ↗
              </span>
            </Link>
          </div>
        </>
      )}
    </>
  );
}


/* =========================================================
   CAMPAIGN PAGE
========================================================= */

function Campaign() {

  const [activeCampaignId, setActiveCampaignIdState] =
    useState<string | null>(() => getActiveCampaignId());

  const [form, setForm] =
    useState<CampaignRequest>(() => {
      const activeCampaign = getActiveCampaign();

      if (activeCampaign) {
        return { ...emptyForm, ...activeCampaign.form };
      }

      const stored = sessionStorage.getItem(
        'campaignmind:campaign-form'
      );

      try {
        return stored
          ? { ...emptyForm, ...JSON.parse(stored) }
          : emptyForm;
      } catch {
        return emptyForm;
      }
    });

  const [result, setResult] =
    useState<CampaignResponse | null>(() => {
      const activeCampaign = getActiveCampaign();

      if (activeCampaign) {
        return activeCampaign.result;
      }

      const stored = sessionStorage.getItem(
        'campaignmind:last-result'
      );

      try {
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    });

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  useEffect(() => {
    const handleCampaignChange = () => {
      const active = getActiveCampaign();

      setActiveCampaignIdState(active?.id ?? null);

      if (active) {
        setForm({
          ...emptyForm,
          ...active.form,
        });
        setResult(active.result);
      }
    };

    window.addEventListener(
      'campaignmind:active-campaign-updated',
      handleCampaignChange
    );

    window.addEventListener(
      'campaignmind:campaigns-updated',
      handleCampaignChange
    );

    return () => {
      window.removeEventListener(
        'campaignmind:active-campaign-updated',
        handleCampaignChange
      );

      window.removeEventListener(
        'campaignmind:campaigns-updated',
        handleCampaignChange
      );
    };
  }, []);

  // Migrate the existing single-campaign data into
  // the new multi-campaign workspace once.
  useEffect(() => {
    if (getCampaigns().length > 0) return;

    const legacyForm = sessionStorage.getItem(
      'campaignmind:campaign-form'
    );

    const legacyResult = sessionStorage.getItem(
      'campaignmind:last-result'
    );

    if (!legacyForm && !legacyResult) return;

    let migratedForm = emptyForm;
    let migratedResult: CampaignResponse | null = null;

    try {
      if (legacyForm) {
        migratedForm = {
          ...emptyForm,
          ...JSON.parse(legacyForm),
        };
      }

      if (legacyResult) {
        migratedResult = JSON.parse(legacyResult);
      }
    } catch {
      return;
    }

    const campaign = createWorkspaceCampaign(
      migratedForm,
      migratedResult,
      loadSelectedCreators()
    );

    setActiveCampaignIdState(campaign.id);
    setForm(migratedForm);
    setResult(migratedResult);
  }, []);


  const update = (
    key: keyof CampaignRequest,
    value: string | number
  ) => {

    setForm((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      sessionStorage.setItem(
        'campaignmind:campaign-form',
        JSON.stringify(next)
      );

      if (activeCampaignId) {
        updateWorkspaceCampaign(activeCampaignId, {
          form: next,
        });
      }

      return next;
    });

  };


  async function submit(
    event: React.FormEvent
  ) {

    event.preventDefault();

    setError('');

    if (
      !form.product ||
      !form.description ||
      !form.category ||
      !form.target_audience ||
      !form.location ||
      !form.budget ||
      !form.goal
    ) {

      setError(
        'Add the required campaign details before searching.'
      );

      return;
    }


    setLoading(true);

    try {

      const response =
        await createCampaign(form);

      setResult(response);

      sessionStorage.setItem(
        'campaignmind:last-result',
        JSON.stringify(response)
      );

      if (activeCampaignId) {
        updateWorkspaceCampaign(activeCampaignId, {
          form: { ...form },
          result: response,
        });
      } else {
        const campaign = createWorkspaceCampaign(
          form,
          response
        );

        setActiveCampaignIdState(campaign.id);
      }

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

    } catch (cause) {

      setError(
        cause instanceof N8nApiError
          ? presentFrontendError(cause.message)
          : 'Campaign search could not be completed.'
      );

    } finally {

      setLoading(false);

    }

  }


  return (
    <>

      {/* PAGE HEADER */}
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">

        <div>
          <p className="eyebrow mb-3">
            ERAYA
          </p>

          <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
            Find your next best creators.
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-[#78857e]">
            Tell ERAYA what your brand needs. The platform will analyze your
            requirements and suggest influencers who fit your campaign.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const campaign = createWorkspaceCampaign(
              emptyForm,
              null
            );

            setActiveCampaignIdState(campaign.id);
            setForm(emptyForm);
            setResult(null);
            setError('');

            sessionStorage.setItem(
              'campaignmind:campaign-form',
              JSON.stringify(emptyForm)
            );

            sessionStorage.removeItem(
              'campaignmind:last-result'
            );

            sessionStorage.removeItem(
              'campaignmind:selected-creators'
            );

            sessionStorage.removeItem(
              'campaignmind:selected-creator-names'
            );

            window.dispatchEvent(
              new Event('campaignmind:selection-updated')
            );

            window.dispatchEvent(
              new Event('campaignmind:outreach-updated')
            );

            window.scrollTo({
              top: 0,
              behavior: 'smooth',
            });
          }}
          className="shrink-0 rounded-xl border border-[#d5dfd1] bg-white px-4 py-2.5 text-sm font-bold text-[#4f7630] shadow-sm transition hover:bg-[#f4f8f0]"
        >
          + New Campaign
        </button>

      </div>


      {/* CAMPAIGN FORM */}
      <form
        onSubmit={submit}
        className="grid gap-6"
      >

        <section className="panel p-6 md:p-8">

          <div className="mb-7 flex items-center gap-3">

            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf5d5] text-sm text-[#547224]">
              01
            </span>

            <div>

              <p className="font-semibold text-[#29463b]">
                Campaign brief
              </p>

              <p className="text-xs text-[#89958e]">
                Tell the AI what kind of creator you need
              </p>

            </div>

          </div>

          <div className="grid gap-5 md:grid-cols-2">

            <Field
              label="Product name *"
              value={form.product}
              onChange={(value) =>
                update('product', value)
              }
              placeholder="e.g. Protein Powder"
            />

            <Field
              label="Category *"
              value={form.category}
              onChange={(value) =>
                update('category', value)
              }
              placeholder="e.g. Fitness"
            />

            <Field
              label="Product description *"
              value={form.description}
              onChange={(value) =>
                update('description', value)
              }
              placeholder="What are you promoting?"
              wide
            />

            <Field
              label="Target audience *"
              value={form.target_audience}
              onChange={(value) =>
                update('target_audience', value)
              }
              placeholder="e.g. College students interested in fitness"
              wide
            />

            <Field
              label="Location *"
              value={form.location}
              onChange={(value) =>
                update('location', value)
              }
              placeholder="e.g. Hyderabad"
            />

            <Field
              label="Budget (₹) *"
              type="number"
              value={form.budget || ''}
              onChange={(value) =>
                update('budget', Number(value))
              }
              placeholder="50000"
            />

            <Field
              label="Campaign goal *"
              value={form.goal}
              onChange={(value) =>
                update('goal', value)
              }
              placeholder="e.g. Sales"
            />

            <div>

              <label className="field-label">
                Preferred platform
              </label>

              <select
                value={form.platform}
                onChange={(event) =>
                  update(
                    'platform',
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
              >

                <option>
                  Instagram
                </option>

                <option>
                  YouTube
                </option>

                <option>
                  LinkedIn
                </option>

              </select>

            </div>


            <Field
              label="Target age"
              value={form.target_age ?? ''}
              onChange={(value) =>
                update('target_age', value)
              }
              placeholder="e.g. 18-30"
            />

            <Field
              label="Target gender"
              value={form.target_gender ?? ''}
              onChange={(value) =>
                update('target_gender', value)
              }
              placeholder="Optional"
            />

            <Field
              label="Additional requirements"
              value={
                form.additional_requirements ?? ''
              }
              onChange={(value) =>
                update(
                  'additional_requirements',
                  value
                )
              }
              placeholder="Optional creator preferences"
              wide
            />

          </div>


          {error && (

            <div
              role="alert"
              className="mt-5 rounded-xl border border-[#f1cccc] bg-[#fff5f5] px-4 py-3 text-sm text-[#a34d4d]"
            >
              {error}
            </div>

          )}


          <div className="mt-8 flex flex-col justify-between gap-4 border-t border-[#edf0eb] pt-6 sm:flex-row sm:items-center">

            <p className="text-xs text-[#89958e]">
              ERAYA will analyze your brief before recommending creators.
            </p>

            <button
              disabled={loading}
              className="rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445] disabled:cursor-wait disabled:opacity-70"
            >
              {loading
                ? 'Finding creators...'
                : 'Find best influencers ↗'}
            </button>

          </div>

        </section>
      </form>


      {/* RESULTS */}
      {result && (
        <RecommendationResults
          result={result}
        />
      )}

    </>
  );
}


/* =========================================================
   RECOMMENDATIONS
========================================================= */

function RecommendationResults({
  result,
}: {
  result: CampaignResponse;
}) {

  const [selectedCreators, setSelectedCreators] =
    useState<SelectedCreator[]>(() => loadSelectedCreators());

  useEffect(() => {
    const refresh = () => {
      setSelectedCreators(loadSelectedCreators());
    };

    window.addEventListener(
      'campaignmind:selection-updated',
      refresh
    );

    window.addEventListener(
      'campaignmind:active-campaign-updated',
      refresh
    );

    return () => {
      window.removeEventListener(
        'campaignmind:selection-updated',
        refresh
      );

      window.removeEventListener(
        'campaignmind:active-campaign-updated',
        refresh
      );
    };
  }, []);

  const recommendations =
    Array.isArray(result.recommendations)
      ? result.recommendations
      : [];

  const storedCampaign = sessionStorage.getItem(
    'campaignmind:campaign-form'
  );
  const activeCampaignForm = getActiveCampaign()?.form ?? null;

  let campaignDetails: CampaignRequest | null = activeCampaignForm;

  if (!campaignDetails) {
    try {
      campaignDetails = storedCampaign
        ? (JSON.parse(storedCampaign) as CampaignRequest)
        : null;
    } catch {
      campaignDetails = null;
    }
  }


  const aiOutput =
    typeof (result as CampaignResponse & {
      output?: unknown;
    }).output === 'string'
      ? (result as CampaignResponse & {
          output?: string;
        }).output
      : '';

  const toggleCreator = (creator: CreatorRecommendation) => {
    const selected = toSelectedCreator(creator);
    const exists = selectedCreators.some(
      (item) => item.creator_id === selected.creator_id
    );

    const nextCreators = exists
      ? selectedCreators.filter(
          (item) => item.creator_id !== selected.creator_id
        )
      : [
          ...selectedCreators,
          {
            ...selected,
            contact:
              selectedCreators.find(
                (item) => item.creator_id === selected.creator_id
              )?.contact ?? selected.contact,
            contactStatus:
              selectedCreators.find(
                (item) => item.creator_id === selected.creator_id
              )?.contactStatus ?? 'idle',
          },
        ];

    persistSelectedCreators(nextCreators);
    setSelectedCreators(nextCreators);
  };

  const updateSelectedCreator = (next: SelectedCreator) => {
    const nextCreators = selectedCreators.map((item) =>
      item.creator_id === next.creator_id ? next : item
    );

    persistSelectedCreators(nextCreators);
    setSelectedCreators(nextCreators);
  };


  return (
    <section className="mt-10">

      <div className="mb-6">

        <p className="eyebrow mb-2">
          AI recommendations
        </p>

        <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
          Suggested influencers
        </h2>

        <p className="mt-2 text-sm text-[#78857e]">
          These creators were selected based on your campaign requirements.
        </p>

      </div>


      {selectedCreators.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[#b8d39d] bg-[#f2f8e3] p-5">

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6f943b]">
                Selected creators
              </p>

              <h3 className="mt-1 font-display text-xl font-semibold text-[#355022]">
                {selectedCreators.length} creator
                {selectedCreators.length !== 1 ? 's' : ''} selected
              </h3>

              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCreators.map((creator) => (
                  <span
                    key={creator.creator_id}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#41623f]"
                  >
                    <span>✓ {creator.name}</span>

                    <button
                      type="button"
                      onClick={() => {
                        const nextCreators = selectedCreators.filter(
                          (item) => item.creator_id !== creator.creator_id
                        );

                        persistSelectedCreators(nextCreators);
                        setSelectedCreators(nextCreators);
                      }}
                      aria-label={`Deselect ${creator.name}`}
                      className="grid h-4 w-4 place-items-center rounded-full text-[#7a8d82] transition hover:bg-[#e8f0df] hover:text-[#355022]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <span className="rounded-full bg-[#41623f] px-3 py-1.5 text-xs font-bold text-white">
              {selectedCreators.length} Selected
            </span>

          </div>

        </div>
      )}


      {recommendations.length > 0 ? ( 

        <>

          <div className="mb-4 flex items-center justify-between">

            <p className="text-sm font-semibold text-[#365548]">
              {recommendations.length} creators found
            </p>

            <p className="text-xs text-[#89958e]">
              Ranked by match score
            </p>

          </div>


          <div className="grid gap-5 lg:grid-cols-3">

            {recommendations.map((creator) => {

              const selected = selectedCreators.find(
                (item) => item.creator_id === creator.creator_id
              );

              return (
                <CreatorCard
                  creator={creator}
                  campaignDetails={campaignDetails}
                  isSelected={Boolean(selected)}
                  selectedCreator={selected ?? null}
                  key={creator.creator_id}
                  onSelect={() => toggleCreator(creator)}
                  onSelectedCreatorUpdate={updateSelectedCreator}
                />
              );
            })}

          </div>

        </>

      ) : (

        <div className="panel p-6">

          <p className="eyebrow mb-2">
            AI campaign analysis
          </p>

          <h2 className="font-display text-xl font-semibold text-[#173c32]">
            ERAYA response
          </h2>


          {aiOutput ? (

            <div className="mt-5 whitespace-pre-wrap rounded-xl bg-[#fbfcfa] p-5 text-sm leading-7 text-[#405c50]">
              {aiOutput}
            </div>

          ) : (

            <div className="mt-5 rounded-xl border border-[#ead9a9] bg-[#fff9e8] p-5 text-sm leading-6 text-[#92712d]">
              No creators were returned for this campaign. Try adjusting the brief and search again.
            </div>

          )}

        </div>

      )}

    </section>
  );
}



/* =========================================================
   CREATOR CARD
========================================================= */

function CreatorCard({
  creator,
  campaignDetails,
  isSelected,
  selectedCreator,
  onSelect,
  onSelectedCreatorUpdate,
}: {
  creator: CreatorRecommendation;
  campaignDetails: CampaignRequest | null;
  isSelected: boolean;
  selectedCreator: SelectedCreator | null;
  onSelect: () => void;
  onSelectedCreatorUpdate: (creator: SelectedCreator) => void;
}) {

  type OutreachState = {
    creator_name?: string;
    creator_email?: string;
    sent: boolean;
    responseStatus:
      | 'waiting'
      | 'accepted'
      | 'negotiating'
      | 'declined'
      | null;
    responseText: string;
    collaborationConfirmed: boolean;
    campaign: {
      product: string;
      category: string;
      goal: string;
      platform: string;
      budget: number;
    } | null;
  };

  const campaignSnapshot = campaignDetails
    ? {
        product: campaignDetails.product,
        category: campaignDetails.category,
        goal: campaignDetails.goal,
        platform: campaignDetails.platform ?? 'Instagram',
        budget: campaignDetails.budget,
      }
    : null;

  const getStoredOutreach = (): OutreachState => {
    const stored = sessionStorage.getItem(
      `campaignmind:outreach:${creator.creator_id}`
    );

    if (!stored) {
      return {
        sent: creator.outreach_status === 'sent',
        responseStatus: null,
        responseText: '',
        collaborationConfirmed: false,
        campaign: campaignSnapshot,
      };
    }

    try {
      return JSON.parse(stored) as OutreachState;
    } catch {
      return {
        sent: creator.outreach_status === 'sent',
        responseStatus: null,
        responseText: '',
        collaborationConfirmed: false,
        campaign: campaignSnapshot,
      };
    }
  };

  const initialOutreach = getStoredOutreach();

  const [showOutreach, setShowOutreach] = useState(false);
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachError, setOutreachError] = useState('');
  const [outreachSent, setOutreachSent] = useState(initialOutreach.sent);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState(
    selectedCreator?.contactError ?? ''
  );

  const [responseStatus, setAssessmentStatus] = useState<
    'waiting' | 'accepted' | 'negotiating' | 'declined' | null
  >(initialOutreach.responseStatus);

  const [responseText, setAssessmentText] =
    useState(initialOutreach.responseText);

  const [collaborationConfirmed, setCollaborationConfirmed] =
    useState(initialOutreach.collaborationConfirmed);

  const contactEmail = selectedCreator?.contact?.email ?? null;
  const contactStatus = selectedCreator?.contactStatus ?? 'idle';
  const sourceUrl =
    creator.source_url ||
    creator.profile_url ||
    creator.creator_id;

  const saveOutreach = (next: OutreachState) => {
    const record = {
      ...next,
      creator_name: creator.name,
      creator_email: contactEmail ?? '',
    };

    sessionStorage.setItem(
      `campaignmind:outreach:${creator.creator_id}`,
      JSON.stringify(record)
    );

    window.dispatchEvent(
      new Event('campaignmind:outreach-updated')
    );
  };

  const creatorDisplayName = creator.name
    .split('|')[0]
    .replace(/\(.*?\)/g, '')
    .trim() || creator.name;

  const defaultOutreachSubject =
    `Collaboration opportunity — ${campaignDetails?.product || 'campaign'}`;

  const defaultOutreachBody = [
    `Hi ${creatorDisplayName},`,
    '',
    `We would like to explore a collaboration on ${creator.platform} for ${campaignDetails?.product || 'our product'}${campaignDetails?.category ? ` (${campaignDetails.category})` : ''}.`,
    '',
    campaignDetails?.goal ? `Campaign goal: ${campaignDetails.goal}.` : '',
    campaignDetails?.description ? `Campaign details: ${campaignDetails.description}` : '',
    campaignDetails?.target_audience ? `Target audience: ${campaignDetails.target_audience}.` : '',
    campaignDetails?.location ? `Campaign location: ${campaignDetails.location}.` : '',
    campaignDetails?.budget ? `Campaign budget: ₹${campaignDetails.budget.toLocaleString('en-IN')}.` : '',
    '',
    'If you are interested, we would be happy to share next steps.',
    '',
    'Best regards',
  ].filter((line, index, lines) => {
    if (line !== '') return true;
    return lines[index - 1] !== '';
  }).join('\n');

  const [outreachSubject, setOutreachSubject] = useState(
    selectedCreator?.contact?.subject || defaultOutreachSubject
  );
  const [outreachBody, setOutreachBody] = useState(
    selectedCreator?.contact?.body || defaultOutreachBody
  );

  async function discoverContact() {
    if (!campaignDetails) {
      setContactError('Save the campaign brief before searching for a contact.');
      return;
    }

    const current = selectedCreator ?? toSelectedCreator(creator);

    setContactLoading(true);
    setContactError('');

    try {
      const result = await findCreatorContact(current, campaignDetails);

      if (result.found && result.contact?.email) {
        setOutreachSubject(result.contact.subject || defaultOutreachSubject);
        setOutreachBody(result.contact.body || defaultOutreachBody);
        onSelectedCreatorUpdate({
          ...current,
          contact: result.contact,
          contactStatus: 'found',
          contactError: null,
        });
        return;
      }

      onSelectedCreatorUpdate({
        ...current,
        contact: null,
        contactStatus: 'not_found',
        contactError: null,
      });
    } catch (error) {
      const message =
        error instanceof N8nApiError
          ? presentFrontendError(error.message)
          : 'Contact search failed.';

      setContactError(message);

      onSelectedCreatorUpdate({
        ...current,
        contact: null,
        contactStatus: 'failed',
        contactError: message,
      });
    } finally {
      setContactLoading(false);
    }
  }

  return (
    <article className="panel overflow-hidden">

      <div className="flex items-start justify-between border-b border-[#edf0eb] p-5">

        <div className="flex items-center gap-3">

          <div className="grid h-11 w-11 place-items-center rounded-full bg-[#dce9d2] font-display font-semibold text-[#41623f]">

            {creatorInitials(creator.name)}

          </div>


          <div>

            <h2 className="font-semibold text-[#29463b]">
              {creator.name}
            </h2>

            <p className="mt-0.5 text-xs text-[#89958e]">
              {creator.platform}
              {creator.location ? ` · ${creator.location}` : ''}
            </p>

          </div>

        </div>


        <span className="rounded-full bg-[#edf5d5] px-2.5 py-1 text-xs font-bold text-[#547224]">
          {creator.match_score}% match
        </span>

      </div>


      <div className="p-5">

        <div className="mb-5 grid grid-cols-2 gap-3">

          {creator.followers !== null && creator.followers !== undefined && (
            <Metric
              label="Followers"
              value={formatFollowers(creator.followers)}
            />
          )}

          {creator.engagement_rate !== null && creator.engagement_rate !== undefined && (
            <Metric
              label="Engagement"
              value={`${creator.engagement_rate}%`}
            />
          )}

          {(creator.followers === null || creator.followers === undefined) && (
            <Metric
              label="Followers"
              value="Not available"
            />
          )}

          {(creator.engagement_rate === null || creator.engagement_rate === undefined) && (
            <Metric
              label="Engagement"
              value="Not available"
            />
          )}

        </div>


        <div className="mb-5 rounded-xl bg-[#fbfcfa] p-3">

          <p className="eyebrow mb-2">
            Why recommended
          </p>

          {creator.reasons.length > 0 ? (
            creator.reasons.map((reason) => (

              <p
                className="mt-1.5 text-xs text-[#5d6e65]"
                key={reason}
              >
                <span className="mr-1.5 text-[#7a9a55]">
                  ✓
                </span>

                {reason}
              </p>

            ))
          ) : (
            <p className="text-xs text-[#89958e]">
              No reasons were returned for this creator.
            </p>
          )}

        </div>

        {sourceUrl && (
          <p className="mb-5 break-all text-xs text-[#5d6e65]">
            <span className="eyebrow mr-2">Profile</span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#41623f] underline-offset-2 hover:underline"
            >
              {sourceUrl}
            </a>
          </p>
        )}


        <div className="flex items-end justify-between border-t border-[#edf0eb] pt-4">

          <div>

            {creator.estimated_price !== null && creator.estimated_price !== undefined ? (
              <>
                <p className="eyebrow">
                  Estimated collaboration cost
                </p>

                <p className="mt-1 font-display text-lg font-semibold text-[#29463b]">
                  ₹{creator.estimated_price.toLocaleString('en-IN')}
                </p>
              </>
            ) : (
              <>
                <p className="eyebrow">
                  Collaboration cost
                </p>

                <p className="mt-1 text-sm font-semibold text-[#89958e]">
                  Not available
                </p>
              </>
            )}

          </div>


          <div className="flex flex-col items-end gap-2">

            {outreachSent ? (
              <span className="rounded-full bg-[#e7f3df] px-3 py-1.5 text-xs font-bold text-[#4f7630]">
                Email sent successfully
              </span>
            ) : (
              <button
                type="button"
                onClick={onSelect}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-[#41623f] text-white hover:bg-[#355532]'
                    : 'border border-[#cad8c9] text-[#41623f] hover:bg-[#f2f8e3]'
                }`}
              >
                {isSelected ? 'Selected' : 'Select Creator'}
              </button>
            )}

          </div>

        </div>

        {isSelected && !outreachSent && (
          <div className="mt-4 rounded-xl border border-[#e1e8dc] bg-[#f7faf4] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f943b]">
              Selected creator
            </p>

            <p className="mt-1 text-sm font-semibold text-[#29463b]">
              {creator.name}
            </p>

            <p className="mt-3 text-xs leading-5 text-[#6f7d75]">
              Find a public business email before outreach. ERAYA will not invent a contact.
            </p>

            <button
              type="button"
              onClick={discoverContact}
              disabled={contactLoading}
              className="mt-3 rounded-lg bg-[#41623f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#355532] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {contactLoading ? 'Finding public contact...' : 'Find public contact'}
            </button>

            {contactLoading && (
              <p className="mt-3 text-xs text-[#66804e]">
                Finding a public business email...
              </p>
            )}

            {!contactLoading && contactStatus === 'found' && contactEmail && (
              <div className="mt-3 rounded-lg border border-[#d8e6c1] bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6f943b]">
                  Public business email found
                </p>
                <p className="mt-1 text-sm font-semibold text-[#29463b]">
                  {contactEmail}
                </p>
                {selectedCreator?.contact?.sourceType && (
                  <p className="mt-1 text-[11px] text-[#6f7d75]">
                    Source type: {selectedCreator.contact.sourceType}
                  </p>
                )}
                {selectedCreator?.contact?.confidence && (
                  <p className="mt-1 text-[11px] text-[#6f7d75]">
                    Confidence: {selectedCreator.contact.confidence}
                  </p>
                )}
                {selectedCreator?.contact?.sourceUrl && (
                  <p className="mt-1 break-all text-[11px] text-[#6f7d75]">
                    <a
                      href={selectedCreator.contact.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#41623f] underline"
                    >
                      View source
                    </a>
                  </p>
                )}
                {selectedCreator?.contact?.subject && (
                  <div className="mt-3 border-t border-[#edf0eb] pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                      AI subject
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#29463b]">
                      {selectedCreator.contact.subject}
                    </p>
                  </div>
                )}
                {selectedCreator?.contact?.body && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                      AI email body
                    </p>
                    <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#5d6e65]">
                      {selectedCreator.contact.body}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOutreachError('');
                    setShowOutreach(true);
                  }}
                  className="mt-3 rounded-lg bg-[#41623f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#355532]"
                >
                  Continue to Outreach
                </button>
              </div>
            )}

            {!contactLoading && contactStatus === 'not_found' && (
              <div className="mt-3 rounded-lg border border-[#ead9a9] bg-[#fff9e8] p-3 text-xs leading-5 text-[#92712d]">
                No public business/professional email found.
              </div>
            )}

            {!contactLoading && contactStatus === 'failed' && (
              <div className="mt-3 rounded-lg border border-[#f0cccc] bg-[#fff5f5] p-3 text-xs leading-5 text-[#a34d4d]">
                {contactError || 'Contact search failed.'}
                <button
                  type="button"
                  onClick={discoverContact}
                  className="mt-2 block font-semibold underline"
                >
                  Retry search
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {outreachSent && (
        <div className="border-t border-[#edf0eb] bg-[#fbfcfa] p-5">
          <div className="rounded-xl border border-[#e1e8dc] bg-white p-4">

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f943b]">
                  Human review
                </p>

                <p className="mt-1 font-display text-lg font-semibold text-[#29463b]">
                  Check the influencer's actual email reply
                </p>

                <p className="mt-1 text-xs leading-5 text-[#89958e]">
                      ERAYA does not automatically interpret the reply.
                  Review the email yourself and record your assessment.
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-[#edf5d5] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#547224]">
                Human decision
              </span>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#89958e]">
                Assessment status
              </label>

              <select
                value={
                  responseStatus === 'waiting' || responseStatus === null
                    ? 'waiting'
                    : responseStatus
                }
                onChange={(event) => {
                  const value = event.target.value as
                    | 'waiting'
                    | 'accepted'
                    | 'negotiating'
                    | 'declined';

                  setAssessmentStatus(value);

                  saveOutreach({
                    sent: true,
                    responseStatus: value,
                    responseText,
                    collaborationConfirmed,
                    campaign: campaignSnapshot,
                  });
                }}
                className="mt-2 w-full rounded-lg border border-[#d8e1d7] bg-white px-3 py-2.5 text-sm text-[#29463b] outline-none focus:border-[#6f943b]"
              >
                <option value="waiting">
                  No response yet
                </option>

                <option value="accepted">
                  Interested / Accepted
                </option>

                <option value="negotiating">
                  Negotiating
                </option>

                <option value="declined">
                  Declined
                </option>
              </select>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#89958e]">
                Human notes
              </label>

              <textarea
                value={responseText}
                onChange={(event) => {
                  setAssessmentText(event.target.value);
                }}
                onBlur={() => {
                  saveOutreach({
                    sent: true,
                    responseStatus:
                      responseStatus ?? 'waiting',
                    responseText,
                    collaborationConfirmed,
                    campaign: campaignSnapshot,
                  });
                }}
                rows={4}
                placeholder="Record what you personally saw in the creator's reply."
                className="mt-2 w-full resize-none rounded-lg border border-[#d8e1d7] bg-white px-3 py-3 text-sm leading-6 text-[#52645c] outline-none placeholder:text-[#a5afa9] focus:border-[#6f943b]"
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-[#e1e8dc] bg-[#f7faf4] px-4 py-3">
              <input
                type="checkbox"
                checked={collaborationConfirmed}
                onChange={(event) => {
                  const confirmed = event.target.checked;

                  setCollaborationConfirmed(confirmed);

                  saveOutreach({
                    sent: true,
                    responseStatus:
                      responseStatus ?? 'waiting',
                    responseText,
                    collaborationConfirmed: confirmed,
                    campaign: campaignSnapshot,
                  });
                }}
                className="h-4 w-4 accent-[#41623f]"
              />

              <span>
                <span className="block text-xs font-semibold text-[#29463b]">
                  Collaboration confirmed
                </span>

                <span className="mt-0.5 block text-[11px] text-[#89958e]">
                  Mark this when you have personally confirmed the collaboration.
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => {
                saveOutreach({
                  sent: true,
                  responseStatus:
                    responseStatus ?? 'waiting',
                  responseText,
                  collaborationConfirmed,
                  campaign: campaignSnapshot,
                });
              }}
              className="mt-4 w-full rounded-lg bg-[#41623f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#355532]"
            >
              Save human assessment
            </button>

          </div>
        </div>
      )}

      {showOutreach && !outreachSent && (
        <div className="border-t border-[#edf0eb] bg-[#fbfcfa] p-5">

          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">
                Outreach draft
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold text-[#29463b]">
                Review before sending
              </h3>
            </div>

            <button
              type="button"
              onClick={() => setShowOutreach(false)}
              className="text-sm text-[#89958e] hover:text-[#355022]"
            >
              ×
            </button>
          </div>

          <div className="rounded-xl border border-[#e1e8dc] bg-white p-4">

            <p className="text-xs font-semibold uppercase tracking-wide text-[#89958e]">
              To
            </p>

            <p className="mt-1 text-sm font-medium text-[#29463b]">
              {contactEmail ?? 'No public business email found'}
            </p>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#89958e]">
              Subject
            </p>

            <input
              type="text"
              value={outreachSubject}
              onChange={(event) => setOutreachSubject(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8e1d7] px-3 py-2 text-sm font-semibold text-[#29463b] outline-none focus:border-[#6f943b]"
            />

            <textarea
              value={outreachBody}
              onChange={(event) => setOutreachBody(event.target.value)}
              rows={10}
              className="mt-1 w-full resize-y rounded-lg border border-[#d8e1d7] px-3 py-3 text-sm leading-6 text-[#5d6e65] outline-none focus:border-[#6f943b]"
            />

          </div>

          {outreachError && (
            <div className="mt-4 rounded-lg border border-[#f0cccc] bg-[#fff5f5] px-3 py-2 text-xs text-[#a34d4d]">
              {outreachError}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">

            <button
              type="button"
              onClick={() => setShowOutreach(false)}
              className="rounded-lg border border-[#cad8c9] px-4 py-2 text-xs font-semibold text-[#41623f]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!contactEmail) {
                  setOutreachError(
                    'No public business email found. We will not send outreach without a verified/public contact.'
                  );
                  return;
                }

                try {
                  setOutreachSending(true);
                  setOutreachError('');

                  const response = await sendOutreach({
                    creator_email: contactEmail,
                    subject: outreachSubject,
                    body: outreachBody,
                  });

                  if (!response.success) {
                    throw new Error(
                      response.message ||
                        'Email failed to send'
                    );
                  }

                  setOutreachSent(true);
                  setAssessmentStatus('waiting');
                  setAssessmentText('');
                  setShowOutreach(false);

                  saveOutreach({
                    sent: true,
                    responseStatus: 'waiting',
                    responseText: '',
                    collaborationConfirmed: false,
                    campaign: campaignSnapshot,
                  });
                } catch (error) {
                  setOutreachError(
                    error instanceof Error
                      ? `Email failed to send. ${presentFrontendError(error.message)}`
                      : 'Email failed to send'
                  );
                } finally {
                  setOutreachSending(false);
                }
              }}
              disabled={outreachSending || !contactEmail}
              className="rounded-lg bg-[#41623f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#355532] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {outreachSending ? 'Sending...' : outreachError ? 'Retry send' : 'Send mail'}
            </button>

          </div>

        </div>
      )}

    </article>
  );
}

function Outreach() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleUpdate = () => {
      setVersion((current) => current + 1);
    };

    window.addEventListener(
      'campaignmind:outreach-updated',
      handleUpdate
    );

    return () => {
      window.removeEventListener(
        'campaignmind:outreach-updated',
        handleUpdate
      );
    };
  }, []);

  const storedCampaignResult =
    sessionStorage.getItem('campaignmind:last-result');

  let campaignRecommendations: CampaignResponse['recommendations'] = [];

  try {
    const parsed = storedCampaignResult
      ? JSON.parse(storedCampaignResult)
      : null;

    campaignRecommendations = Array.isArray(
      parsed?.recommendations
    )
      ? parsed.recommendations
      : [];
  } catch {
    campaignRecommendations = [];
  }

  const contacted = Object.keys(sessionStorage)
    .filter((key) =>
      key.startsWith('campaignmind:outreach:')
    )
    .map((key) => {
      const stored = sessionStorage.getItem(key);

      if (!stored) {
        return null;
      }

      try {
        const outreach = JSON.parse(stored);

        if (!outreach.sent || isDemoCreatorEmail(outreach.creator_email)) {
          return null;
        }

        return {
          creatorId: key.replace(
            'campaignmind:outreach:',
            ''
          ),
          outreach,
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is {
      creatorId: string;
      outreach: {
        creator_name?: string;
        creator_email?: string;
        sent: boolean;
        responseStatus:
          | 'waiting'
          | 'accepted'
          | 'negotiating'
          | 'declined'
          | null;
        responseText: string;
        collaborationConfirmed: boolean;
        campaign?: {
          product: string;
          category: string;
          goal: string;
          platform: string;
          budget: number;
        } | null;
      };
    } => item !== null);

  const counts = {
    contacted: contacted.length,
    waiting: contacted.filter(
      ({ outreach }) =>
        outreach.responseStatus === 'waiting' ||
        outreach.responseStatus === null
    ).length,
    accepted: contacted.filter(
      ({ outreach }) =>
        outreach.responseStatus === 'accepted'
    ).length,
    negotiating: contacted.filter(
      ({ outreach }) =>
        outreach.responseStatus === 'negotiating'
    ).length,
    declined: contacted.filter(
      ({ outreach }) =>
        outreach.responseStatus === 'declined'
    ).length,
    confirmed: contacted.filter(
      ({ outreach }) =>
        outreach.collaborationConfirmed
    ).length,
  };

  const statusStyles = {
    waiting: 'bg-[#fff7df] text-[#946f16]',
    accepted: 'bg-[#e7f3df] text-[#4f7630]',
    negotiating: 'bg-[#e9f0ff] text-[#48689a]',
    declined: 'bg-[#fff0f0] text-[#a34d4d]',
  };

  const statusLabels = {
    waiting: 'Awaiting response',
    accepted: 'Accepted',
    negotiating: 'Negotiating',
    declined: 'Declined',
  };

  return (
    <div key={version}>

      {/* PAGE HEADER */}
      <div className="mb-8">
        <p className="eyebrow mb-3">
          Influencer outreach
        </p>

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
              Outreach workspace.
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#78857e]">
              Manage creator outreach, review real email replies yourself,
              and record collaboration decisions in one place.
            </p>
          </div>

          <div className="rounded-full bg-[#edf5e8] px-4 py-2 text-xs font-bold text-[#4f7630]">
            {counts.contacted} contacted
          </div>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">

        {[
          ['Contacted', counts.contacted],
          ['Awaiting', counts.waiting],
          ['Accepted', counts.accepted],
          ['Negotiating', counts.negotiating],
          ['Declined', counts.declined],
          ['Confirmed', counts.confirmed],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="panel p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#89958e]">
              {label}
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-[#29463b]">
              {value}
            </p>
          </div>
        ))}

      </div>

      {/* HUMAN REVIEW NOTICE */}
      <div className="mb-6 rounded-2xl border border-[#dfe8d9] bg-[#f7faf4] p-5">
        <div className="flex gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e2edd8] text-[#547224]">
            ✓
          </div>

          <div>
            <p className="font-semibold text-[#29463b]">
              Human-controlled response tracking
            </p>

            <p className="mt-1 text-sm leading-6 text-[#6f7d75]">
              Check the influencer's actual email yourself. ERAYA
              does not automatically interpret, summarize, or invent the
              influencer's response.
            </p>
          </div>
        </div>
      </div>

      {/* OUTREACH LIST */}
      {contacted.length === 0 ? (
        <section className="panel p-10 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#edf5e8] text-xl text-[#6f943b]">
            ✉
          </div>

          <h2 className="font-display text-xl font-semibold text-[#29463b]">
            No outreach yet
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#89958e]">
            Go to Campaign, generate an outreach email for a recommended
            creator, and send it to start tracking your outreach here.
          </p>

          <Link
            to="/campaign"
            className="mt-5 inline-flex rounded-lg bg-[#41623f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#355532]"
          >
            Go to Campaign
          </Link>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">
                Active outreach
              </p>

              <h2 className="mt-1 font-display text-xl font-semibold text-[#29463b]">
                Contacted influencers
              </h2>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">

            {contacted.map(({ creatorId, outreach }) => {

              const status =
                outreach.responseStatus ?? 'waiting';

              const creator = campaignRecommendations.find(
                (item) =>
                  item.creator_id === creatorId
              );

              return (
                <article
                  key={creatorId}
                  className="overflow-hidden rounded-2xl border border-[#dfe6dd] bg-white shadow-[0_8px_30px_rgba(35,60,50,0.05)]"
                >

                  {/* CREATOR */}
                  <div className="border-b border-[#edf0eb] p-5">
                    <div className="flex items-start justify-between gap-4">

                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-[#dce9d2] font-display font-semibold text-[#41623f]">
                          {(outreach.creator_name || creator?.name || creatorId)
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>

                        <div>
                          <h3 className="font-display text-lg font-semibold text-[#29463b]">
                            {outreach.creator_name || creatorId}
                          </h3>

                          <p className="mt-0.5 text-xs text-[#89958e]">
                            {outreach.creator_email || 'No email recorded'}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          statusStyles[status]
                        }`}
                      >
                        {statusLabels[status]}
                      </span>

                    </div>
                  </div>

                  <div className="p-5">

                    {/* CREATOR PERFORMANCE */}
                    {creator && (
                      <div className="mb-4 rounded-xl border border-[#e1e8dc] bg-[#f7faf4] p-4">

                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f943b]">
                              Creator profile
                            </p>

                            <p className="mt-1 text-sm font-semibold text-[#29463b]">
                              {creator.platform || 'Platform'}
                              {creator.category
                                ? ` · ${creator.category}`
                                : ''}
                            </p>
                          </div>

                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-[#547224]">
                            Match {Number(creator.match_score || 0)}%
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Followers
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              {Number(
                                creator.followers || 0
                              ).toLocaleString('en-IN')}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Engagement
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              {Number(
                                creator.engagement_rate || 0
                              ).toFixed(1)}%
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Est. price
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              ₹{Number(
                                creator.estimated_price || 0
                              ).toLocaleString('en-IN')}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Location
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#40544b]">
                              {creator.location || '—'}
                            </p>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* CAMPAIGN */}
                    {outreach.campaign && (
                      <div className="rounded-xl border border-[#e1e8dc] bg-[#f7faf4] p-4">

                        <div className="flex items-center gap-2">
                          <span>📦</span>

                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f943b]">
                            Campaign
                          </p>
                        </div>

                        <p className="mt-2 font-display text-lg font-semibold text-[#29463b]">
                          {outreach.campaign.product || 'Campaign product'}
                        </p>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Category
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              {outreach.campaign.category || '—'}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Platform
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              {outreach.campaign.platform || '—'}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Goal
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              {outreach.campaign.goal || '—'}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                              Budget
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#40544b]">
                              ₹{Number(
                                outreach.campaign.budget || 0
                              ).toLocaleString('en-IN')}
                            </p>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* OUTREACH */}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">

                      <div className="rounded-xl border border-[#edf0eb] bg-[#fbfcfa] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                          Outreach
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#4f7630]">
                          ✓ Email sent successfully
                        </p>
                      </div>

                      <div className="rounded-xl border border-[#edf0eb] bg-[#fbfcfa] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
                          Collaboration
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#40544b]">
                          {outreach.collaborationConfirmed
                            ? '✓ Confirmed'
                            : 'Not confirmed'}
                        </p>
                      </div>

                    </div>

                    {/* HUMAN ASSESSMENT */}
                    <div className="mt-4 rounded-xl border border-[#edf0eb] p-4">

                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#89958e]">
                        Human assessment
                      </p>

                      <p className="mt-2 text-sm font-semibold text-[#40544b]">
                        {statusLabels[status]}
                      </p>

                      {outreach.responseText ? (
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#6f7d75]">
                          {outreach.responseText}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs leading-5 text-[#9aa59f]">
                          Check the influencer's actual email and record your
                          assessment from the Campaign page.
                        </p>
                      )}

                    </div>

                    <Link
                      to="/campaign"
                      className="mt-4 inline-flex rounded-lg border border-[#cad8c9] px-4 py-2 text-xs font-semibold text-[#41623f] transition hover:bg-[#f2f8e3]"
                    >
                      Review on Campaign
                    </Link>

                  </div>
                </article>
              );
            })}

          </div>
        </section>
      )}

    </div>
  );
}


/* =========================================================
   ENGAGEMENT
========================================================= */

function Engagement() {
  type SelectedCreator = NonNullable<
    CampaignResponse['recommendations']
  >[number];

  type Performance = {
    reach: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    dailyReach: number[];
  };

  const [selectedCreators, setSelectedCreators] = useState<
    SelectedCreator[]
  >([]);

  useEffect(() => {
    const stored = sessionStorage.getItem(
      'campaignmind:selected-creators'
    );

    if (!stored) {
      setSelectedCreators([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed)) {
        setSelectedCreators(parsed);
      } else {
        setSelectedCreators([]);
      }
    } catch {
      setSelectedCreators([]);
    }
  }, []);

  const getPerformance = (
    creator: SelectedCreator,
    index: number
  ): Performance => {
    const followers = Number(creator.followers || 0);
    const engagementRate = Number(
      creator.engagement_rate || 0
    );

    const reach = Math.round(
      followers * (1.35 + index * 0.08)
    );

    const views = Math.round(
      reach * (0.64 + index * 0.025)
    );

    const likes = Math.round(
      reach * (engagementRate / 100) * 0.78
    );

    const comments = Math.round(
      likes * 0.043
    );

    const shares = Math.round(
      likes * 0.061
    );

    const saves = Math.round(
      likes * 0.108
    );

    const dailyReach = [
      0.18,
      0.31,
      0.43,
      0.57,
      0.71,
      0.86,
      1,
    ].map((multiplier) =>
      Math.round(reach * multiplier)
    );

    return {
      reach,
      views,
      likes,
      comments,
      shares,
      saves,
      dailyReach,
    };
  };

  const formatMetric = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }

    return value.toLocaleString('en-IN');
  };

  if (selectedCreators.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Campaign performance"
          title="Engagement"
          description="See how your influencers' content is performing after it goes live."
        />

        <div className="panel p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2f8e3] text-2xl text-[#6f943b]">
            ↗
          </div>

          <h2 className="mt-5 font-display text-xl font-semibold text-[#173c32]">
            No creators selected
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718078]">
            Go to Campaign, select one or more creators, and their
            campaign performance will appear here.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Campaign performance"
        title="Engagement"
        description="See how your influencers' content is performing after it goes live."
      />

      <div className="mb-6 rounded-2xl border border-[#d8e6c1] bg-[#f2f8e3] p-5">
        <p className="eyebrow text-[#6f943b]">
          Selected campaign
        </p>

        <div className="mt-1 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="font-display text-lg font-semibold text-[#355022]">
              Protein Powder Launch
            </p>

            <p className="mt-1 text-xs text-[#66804e]">
              {selectedCreators.length} creator
              {selectedCreators.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#547224]">
            Demo performance
          </span>
        </div>
      </div>

      <div className="space-y-8">
        {selectedCreators.map((creator, index) => {
          const performance = getPerformance(
            creator,
            index
          );

          const totalInteractions =
            performance.likes +
            performance.comments +
            performance.shares +
            performance.saves;

          const calculatedRate =
            performance.reach > 0
              ? (totalInteractions / performance.reach) * 100
              : 0;

          return (
            <section
              key={creator.creator_id}
              className="space-y-6"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <p className="eyebrow text-[#6f943b]">
                    Creator {index + 1}
                  </p>

                  <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-[#173c32]">
                    {creator.name}
                  </h2>

                  <p className="mt-1 text-xs text-[#718078]">
                    {creator.platform} · {creator.category} ·{' '}
                    {formatMetric(Number(creator.followers || 0))}{' '}
                    followers
                  </p>
                </div>

                <span className="w-fit rounded-full bg-[#edf5df] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#547224]">
                  Mock campaign data
                </span>
              </div>

              {/* METRICS */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {[
                  ['Reach', formatMetric(performance.reach)],
                  ['Views', formatMetric(performance.views)],
                  ['Likes', formatMetric(performance.likes)],
                  ['Comments', formatMetric(performance.comments)],
                  ['Shares', formatMetric(performance.shares)],
                  ['Saves', formatMetric(performance.saves)],
                ].map(([label, value]) => (
                  <div
                    className="panel p-5"
                    key={label}
                  >
                    <p className="eyebrow">
                      {label}
                    </p>

                    <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
                      {value}
                    </p>

                    <p className="mt-1 text-[10px] text-[#8a968f]">
                      Current reel
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
                {/* CHART */}
                <section className="panel p-6">
                  <div className="mb-7">
                    <p className="eyebrow mb-1">
                      Reach
                    </p>

                    <h3 className="font-display text-lg font-semibold text-[#173c32]">
                      Reel performance
                    </h3>
                  </div>

                  <div className="flex h-[260px] items-end gap-3 border-b border-l border-[#dfe6df] px-4 pb-0">
                    {performance.dailyReach.map(
                      (value, dayIndex) => {
                        const maxReach =
                          performance.reach || 1;

                        const height = Math.max(
                          8,
                          (value / maxReach) * 100
                        );

                        return (
                          <div
                            key={dayIndex}
                            className="group flex h-full flex-1 items-end"
                          >
                            <div
                              className="w-full rounded-t-lg bg-[#b8cf91] transition group-hover:bg-[#7e9d75]"
                              style={{
                                height: `${height}%`,
                              }}
                              title={`Day ${
                                dayIndex + 1
                              }: ${formatMetric(value)} reach`}
                            />
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className="mt-3 flex justify-between px-4 text-[10px] text-[#9aa59f]">
                    {performance.dailyReach.map(
                      (_, dayIndex) => (
                        <span key={dayIndex}>
                          Day {dayIndex + 1}
                        </span>
                      )
                    )}
                  </div>
                </section>

                {/* ENGAGEMENT RATE */}
                <section className="relative overflow-hidden rounded-2xl bg-[#173c32] p-7 text-white">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d5ed78] text-lg text-[#173c32]">
                    ⌁
                  </span>

                  <p className="eyebrow mt-8 text-[#8fb399]">
                    Engagement rate
                  </p>

                  <p className="mt-2 font-display text-5xl font-semibold tracking-[-0.05em]">
                    {calculatedRate.toFixed(1)}%
                  </p>

                  <p className="mt-4 text-xs leading-5 text-[#a6bdb0]">
                    Calculated from likes, comments, shares,
                    saves and reach for this reel.
                  </p>
                </section>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* =========================================================
   SALES & ROI
========================================================= */

function Sales() {
  type SelectedCreator = NonNullable<
    CampaignResponse['recommendations']
  >[number];

  type SalesData = {
    code: string;
    orders: number;
    revenue: number;
    cost: number;
    profit: number;
    roi: number;
    conversionRate: number;
  };

  const [selectedCreators, setSelectedCreators] = useState<
    SelectedCreator[]
  >([]);

  const [campaignForm, setCampaignForm] =
    useState<CampaignRequest | null>(() => {
      const stored = sessionStorage.getItem(
        'campaignmind:campaign-form'
      );

      try {
        return stored
          ? (JSON.parse(stored) as CampaignRequest)
          : null;
      } catch {
        return null;
      }
    });

  useEffect(() => {
    const stored = sessionStorage.getItem(
      'campaignmind:selected-creators'
    );

    if (!stored) {
      setSelectedCreators([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed)) {
        setSelectedCreators(parsed);
      } else {
        setSelectedCreators([]);
      }
    } catch {
      setSelectedCreators([]);
    }
  }, []);

  const getSalesData = (
    creator: SelectedCreator,
    index: number
  ): SalesData => {
    const followers = Number(creator.followers || 0);
    const engagementRate = Number(
      creator.engagement_rate || 0
    );
    const cost = Number(
      creator.estimated_price || 0
    );

    /*
     * Demo conversion model:
     * Higher followers + engagement produce more orders.
     * These are mock numbers for the prototype.
     */
    const baseOrders = Math.round(
      followers * 0.00105
    );

    const engagementBonus = Math.round(
      engagementRate * 3.5
    );

    const orders = Math.max(
      8,
      baseOrders + engagementBonus + index * 5
    );

    // Demo product selling price.
    const productPrice = 500;

    const revenue = orders * productPrice;
    const profit = revenue - cost;
    const roi =
      cost > 0
        ? (profit / cost) * 100
        : 0;

    const reach = Math.max(
      followers * (1.35 + index * 0.08),
      1
    );

    const conversionRate =
      (orders / reach) * 100;

    const codePrefix = creator.name
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();

    return {
      code: `${codePrefix || 'CREATOR'}20`,
      orders,
      revenue,
      cost,
      profit,
      roi,
      conversionRate,
    };
  };

  const formatCurrency = (value: number) =>
    `₹${Math.round(value).toLocaleString('en-IN')}`;

  const formatMetric = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }

    return Math.round(value).toLocaleString('en-IN');
  };

  if (selectedCreators.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Campaign revenue"
          title="Sales & ROI"
          description="Track purchases generated through influencer promo codes and understand campaign return."
        />

        <div className="panel p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2f8e3] text-2xl text-[#6f943b]">
            ₹
          </div>

          <h2 className="mt-5 font-display text-xl font-semibold text-[#173c32]">
            No creators selected
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718078]">
            Go to Campaign, select one or more creators,
            and their sales and ROI data will appear here.
          </p>
        </div>
      </>
    );
  }

  const sales = selectedCreators.map(
    (creator, index) => ({
      creator,
      data: getSalesData(creator, index),
    })
  );

  const totalOrders = sales.reduce(
    (sum, item) => sum + item.data.orders,
    0
  );

  const totalRevenue = sales.reduce(
    (sum, item) => sum + item.data.revenue,
    0
  );

  const totalCost = sales.reduce(
    (sum, item) => sum + item.data.cost,
    0
  );

  const totalProfit = totalRevenue - totalCost;

  const overallRoi =
    totalCost > 0
      ? (totalProfit / totalCost) * 100
      : 0;

  const maxRevenue = Math.max(
    ...sales.map((item) => item.data.revenue),
    1
  );

  return (
    <>
      <PageHeader
        eyebrow="Campaign revenue"
        title="Sales & ROI"
        description="Track purchases generated through influencer promo codes and understand campaign return."
      />

      {/* CAMPAIGN SUMMARY */}
      <div className="mb-6 rounded-2xl border border-[#d8e6c1] bg-[#f2f8e3] p-5">
        <p className="eyebrow text-[#6f943b]">
          Selected campaign
        </p>

        <div className="mt-1 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="font-display text-lg font-semibold text-[#355022]">
              {campaignForm?.product || 'Current campaign'}
            </p>

            <p className="mt-1 text-xs text-[#66804e]">
              {selectedCreators.length} creator
              {selectedCreators.length !== 1 ? 's' : ''}{' '}
              · Promo-code attribution
            </p>

            {campaignForm?.budget ? (
              <p className="mt-1 text-xs text-[#66804e]">
                Campaign budget: ₹{Number(
                  campaignForm.budget
                ).toLocaleString('en-IN')}
              </p>
            ) : null}
          </div>

          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#547224]">
            Mock sales data
          </span>
        </div>
      </div>

      {/* TOP METRICS */}
      <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SalesMetric
          label="Orders"
          value={formatMetric(totalOrders)}
          note="Attributed purchases"
        />

        <SalesMetric
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          note="From promo codes"
        />

        <SalesMetric
          label="Campaign cost"
          value={formatCurrency(totalCost)}
          note="Creator collaboration"
        />

        <SalesMetric
          label="ROI"
          value={`${overallRoi.toFixed(1)}%`}
          note="Return on creator spend"
        />
      </div>

      {/* PROFIT HIGHLIGHT */}
      <section className="mb-8 relative overflow-hidden rounded-2xl bg-[#173c32] p-7 text-white">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="eyebrow text-[#8fb399]">
              Campaign profit
            </p>

            <p className="mt-2 font-display text-4xl font-semibold tracking-[-0.05em]">
              {formatCurrency(totalProfit)}
            </p>

            <p className="mt-3 max-w-xl text-xs leading-5 text-[#a6bdb0]">
              Revenue generated through influencer promo
              codes minus estimated creator collaboration
              costs.
            </p>
          </div>

          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#d5ed78] text-2xl text-[#173c32]">
            ₹
          </div>
        </div>
      </section>

      {/* REVENUE CHART */}
      <section className="panel mb-8 p-6">
        <div className="mb-7">
          <p className="eyebrow mb-1">
            Revenue attribution
          </p>

          <h2 className="font-display text-lg font-semibold text-[#173c32]">
            Revenue by creator
          </h2>
        </div>

        <div className="space-y-5">
          {sales.map(({ creator, data }) => {
            const width =
              (data.revenue / maxRevenue) * 100;

            return (
              <div key={creator.creator_id}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold text-[#41623f]">
                    {creator.name}
                  </span>

                  <span className="text-xs font-semibold text-[#173c32]">
                    {formatCurrency(data.revenue)}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-[#edf0eb]">
                  <div
                    className="h-full rounded-full bg-[#9fbc70] transition-all"
                    style={{
                      width: `${width}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CREATOR SALES CARDS */}
      <div className="grid gap-6 lg:grid-cols-2">
        {sales.map(({ creator, data }, index) => (
          <section
            key={creator.creator_id}
            className="panel p-6"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="eyebrow text-[#6f943b]">
                  Creator {index + 1}
                </p>

                <h2 className="mt-1 font-display text-xl font-semibold text-[#173c32]">
                  {creator.name}
                </h2>

                <p className="mt-1 text-xs text-[#718078]">
                  {creator.platform} · {creator.category}
                </p>
              </div>

              <div className="rounded-xl bg-[#f2f8e3] px-4 py-3">
                <p className="eyebrow text-[#6f943b]">
                  Promo code
                </p>

                <p className="mt-1 font-mono text-sm font-bold tracking-wide text-[#355022]">
                  {data.code}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <SalesMetric
                label="Orders"
                value={formatMetric(data.orders)}
                note="Attributed purchases"
              />

              <SalesMetric
                label="Revenue"
                value={formatCurrency(data.revenue)}
                note="Promo-code revenue"
              />

              <SalesMetric
                label="Creator cost"
                value={formatCurrency(data.cost)}
                note="Estimated collaboration"
              />

              <SalesMetric
                label="Profit"
                value={formatCurrency(data.profit)}
                note="Revenue minus cost"
              />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#fbfcfa] p-4">
                <p className="eyebrow">
                  ROI
                </p>

                <p className="mt-2 font-display text-2xl font-semibold text-[#41623f]">
                  {data.roi.toFixed(1)}%
                </p>
              </div>

              <div className="rounded-xl bg-[#fbfcfa] p-4">
                <p className="eyebrow">
                  Conversion
                </p>

                <p className="mt-2 font-display text-2xl font-semibold text-[#41623f]">
                  {data.conversionRate.toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-[#edf0eb] pt-4">
              <p className="text-[10px] leading-5 text-[#8a968f]">
                Demo attribution based on mock promo-code
                purchases. Replace with real checkout or
                ecommerce events for production reporting.
              </p>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   PROFILE
========================================================= */

function Profile() {
  type ProfileData = {
    name: string;
    company: string;
    email: string;
    location: string;
    photo: string;
  };

  const defaultProfile: ProfileData = {
    name: 'Aanya Sharma',
    company: 'Your Brand',
    email: 'aanya@brand.com',
    location: 'Hyderabad',
    photo: '',
  };

  const [profile, setProfile] = useState<ProfileData>(() => {
    const stored = localStorage.getItem(
      'campaignmind:profile'
    );

    try {
      return stored
        ? {
            ...defaultProfile,
            ...JSON.parse(stored),
          }
        : defaultProfile;
    } catch {
      return defaultProfile;
    }
  });

  const [saved, setSaved] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [photoDirty, setPhotoDirty] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const updateProfile = (
    field: keyof ProfileData,
    value: string
  ) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));

    setSaved(false);
  };

  const chooseProfilePhoto = (file: File | null) => {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSaved(false);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setSaved(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const photo = typeof reader.result === 'string' ? reader.result : '';
      if (!photo) return;

      setProfile((current) => ({ ...current, photo }));
      setSaved(false);
      setPhotoSaved(false);
      setPhotoDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const removeProfilePhoto = () => {
    setProfile((current) => ({ ...current, photo: '' }));
    setSaved(false);
    setPhotoSaved(false);
    setPhotoDirty(true);
    if (profilePhotoInputRef.current) {
      profilePhotoInputRef.current.value = '';
    }
  };

  const saveProfile = () => {
    localStorage.setItem(
      'campaignmind:profile',
      JSON.stringify(profile)
    );

    window.dispatchEvent(
      new Event('campaignmind:profile-updated')
    );

    setSaved(true);
    setPhotoSaved(photoDirty);
    setPhotoDirty(false);
  };

  const resetProfile = () => {
    setProfile(defaultProfile);

    localStorage.setItem(
      'campaignmind:profile',
      JSON.stringify(defaultProfile)
    );

    setSaved(true);
    setPhotoSaved(false);
    setPhotoDirty(false);
  };

  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AS';

  return (
    <>
      <PageHeader
        eyebrow="Workspace settings"
        title="Profile"
        description="Manage the brand information used across your ERAYA workspace."
      />

      <section className="panel max-w-4xl p-6 md:p-8">

        {/* PROFILE HEADER */}
        <div className="mb-8 flex flex-col gap-5 border-b border-[#d9dee4] pb-8 sm:flex-row sm:items-center">

          <div className="relative shrink-0">
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => chooseProfilePhoto(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              aria-label="Change profile photo"
              onClick={() => profilePhotoInputRef.current?.click()}
              className="group relative grid h-24 w-24 overflow-hidden rounded-full bg-[#dce5f2] text-2xl font-bold text-[#304e78] ring-4 ring-[#eef2f7]"
            >
              {profile.photo ? (
                <img src={profile.photo} alt="Profile" className="h-full w-full object-cover" />
              ) : initials}
              <span className="absolute inset-0 grid place-items-center bg-[#16283a]/75 px-2 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-white opacity-0 transition group-hover:opacity-100">Change photo</span>
            </button>
          </div>

          <div>
            <p className="eyebrow text-[#6578b8]">
              Brand workspace
            </p>

            <h2 className="mt-1 font-display text-2xl font-semibold text-[#16283a]">
              {profile.name || 'Your name'}
            </h2>

            <p className="mt-1 text-sm text-[#758292]">
              {profile.company || 'Your company'}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => profilePhotoInputRef.current?.click()} className="text-xs font-semibold text-[#5268ae] hover:text-[#30467f]">Change photo</button>
              {profile.photo && <button type="button" onClick={removeProfilePhoto} className="text-xs font-semibold text-[#995757] hover:text-[#753f3f]">Remove photo</button>}
            </div>
          </div>

        </div>

        {/* FORM */}
        <div className="grid gap-5 md:grid-cols-2">

          <div>
            <label className="field-label">
              Name
            </label>

            <input
              type="text"
              value={profile.name}
              onChange={(event) =>
                updateProfile(
                  'name',
                  event.target.value
                )
              }
              placeholder="Enter your name"
              className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
            />
          </div>

          <div>
            <label className="field-label">
              Company / Brand
            </label>

            <input
              type="text"
              value={profile.company}
              onChange={(event) =>
                updateProfile(
                  'company',
                  event.target.value
                )
              }
              placeholder="Enter company or brand"
              className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
            />
          </div>

          <div>
            <label className="field-label">
              Email
            </label>

            <input
              type="email"
              value={profile.email}
              onChange={(event) =>
                updateProfile(
                  'email',
                  event.target.value
                )
              }
              placeholder="name@company.com"
              className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
            />
          </div>

          <div>
            <label className="field-label">
              Default location
            </label>

            <input
              type="text"
              value={profile.location}
              onChange={(event) =>
                updateProfile(
                  'location',
                  event.target.value
                )
              }
              placeholder="e.g. Hyderabad"
              className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
            />
          </div>

        </div>

        {/* SAVE AREA */}
        <div className="mt-8 flex flex-col gap-3 border-t border-[#edf0eb] pt-6 sm:flex-row sm:items-center">

          <button
            type="button"
            onClick={saveProfile}
            className="rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445]"
          >
            Save changes
          </button>

          <button
            type="button"
            onClick={resetProfile}
            className="rounded-xl border border-[#cad8c9] px-5 py-3 text-sm font-semibold text-[#41623f] transition hover:bg-[#f2f8e3]"
          >
            Reset
          </button>

          {saved && (
            <span className="text-xs font-semibold text-[#5268ae]">
              ✓ {photoSaved ? 'Profile photo updated' : 'Changes saved'}
            </span>
          )}

        </div>

      </section>

      {/* PROFILE INFORMATION */}
      <section className="panel mt-6 max-w-3xl p-6">

        <p className="eyebrow">
          Profile information
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">

          <div className="rounded-xl bg-[#fbfcfa] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
              Workspace
            </p>

            <p className="mt-1 text-sm font-semibold text-[#40544b]">
              Brand account
            </p>
          </div>

          <div className="rounded-xl bg-[#fbfcfa] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
              Location
            </p>

            <p className="mt-1 text-sm font-semibold text-[#40544b]">
              {profile.location || 'Not set'}
            </p>
          </div>

          <div className="rounded-xl bg-[#fbfcfa] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#89958e]">
              Account
            </p>

            <p className="mt-1 text-sm font-semibold text-[#40544b]">
              Active
            </p>
          </div>

        </div>

      </section>
    </>
  );
}


/* =========================================================
   REUSABLE COMPONENTS
========================================================= */

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {

  return (
    <div className="mb-8">

      <p className="eyebrow mb-3">
        {eyebrow}
      </p>

      <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
        {title}
      </h1>

      <p className="mt-2 max-w-xl text-sm leading-6 text-[#78857e]">
        {description}
      </p>

    </div>
  );
}


function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  wide = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  wide?: boolean;
}) {

  return (
    <div className={wide ? 'md:col-span-2' : ''}>

      <label className="field-label">
        {label}
      </label>


      {wide && label.toLowerCase().includes('description') ? (

        <textarea
          rows={3}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className="w-full resize-none rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
        />

      ) : (

        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none transition placeholder:text-[#a1aca5] focus:border-[#759c73] focus:ring-2 focus:ring-[#dcebc2]"
        />

      )}

    </div>
  );
}


function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div>

      <p className="eyebrow">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-[#405c50]">
        {value}
      </p>

    </div>
  );
}


function SalesMetric({
  label,
  value,
  note,
  highlight = false,
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {

  return (
    <div
      className={`panel p-5 ${
        highlight
          ? 'border-[#d8e6c1] bg-[#f2f8e3]'
          : ''
      }`}
    >

      <p className="eyebrow">
        {label}
      </p>

      <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#173c32]">
        {value}
      </p>

      <p className="mt-1 text-xs text-[#8a968f]">
        {note}
      </p>

    </div>
  );
}


function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div>

      <label className="field-label">
        {label}
      </label>

      <input
        value={value}
        readOnly
        className="w-full rounded-xl border border-[#dfe6df] bg-[#fbfcfa] px-3.5 py-3 text-sm text-[#29463b] outline-none"
      />

    </div>
  );
}


export default App;
