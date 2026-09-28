import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  createCampaign,
  getDashboardData,
  isMockMode,
  N8nApiError,
} from './api/n8n';

import type {
  CampaignRequest,
  CampaignResponse,
  DashboardData,
} from './api/types';


/* =========================================================
   NAVIGATION
========================================================= */

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/campaign', label: 'Campaign', icon: '◎' },
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
   APP
========================================================= */

function App() {
  return (
    <Routes>
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}


/* =========================================================
   MAIN SHELL
========================================================= */

function Shell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageNames: Record<string, string> = {
    '/': 'Dashboard',
    '/campaign': 'Campaign',
    '/campaigns/new': 'Campaign',
    '/engagement': 'Engagement',
    '/sales': 'Sales & ROI',
    '/profile': 'Profile',
  };

  const currentPage =
    pageNames[location.pathname] ?? 'CampaignMind';

  function handleLogout() {
    sessionStorage.clear();
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4]">

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[252px] border-r border-[#e3e8e2] bg-[#f1f4ee] px-5 py-6 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* LOGO */}
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#173c32] text-lg text-[#d5ed78]">
            ✦
          </div>

          <span className="font-display text-lg font-semibold tracking-[-0.04em] text-[#173c32]">
            CampaignMind
          </span>
        </div>


        {/* MAIN NAVIGATION */}
        <p className="eyebrow mb-3 px-2">
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
                    ? 'bg-white font-semibold text-[#173c32] shadow-sm'
                    : 'text-[#68766e] hover:bg-white/70 hover:text-[#173c32]'
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
                  ? 'bg-white font-semibold text-[#173c32] shadow-sm'
                  : 'text-[#68766e] hover:bg-white/70 hover:text-[#173c32]'
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
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#68766e] transition hover:bg-white/70 hover:text-[#173c32]"
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
      <main className="lg:pl-[252px]">

        {/* HEADER */}
        <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e2] bg-[#f7f8f4]/90 px-5 backdrop-blur md:px-10">

          <button
            aria-label="Open navigation"
            className="text-xl text-[#173c32] lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>

          <div className="hidden text-xs text-[#819087] md:block">
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
                Aanya Sharma
              </p>

              <p className="text-[10px] text-[#8a968f]">
                Brand workspace
              </p>
            </div>

            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e4cfaa] text-xs font-bold text-[#5b4227]">
              AS
            </div>

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


          <Routes>

            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/campaign"
              element={<Campaign />}
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

    </div>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {

  const [data, setData] =
    useState<DashboardData | null>(null);

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);


  const stats = data
    ? [
        [
          'Campaigns',
          data.total_campaigns,
          '◎',
        ],
        [
          'Active campaigns',
          data.active_campaigns,
          '◷',
        ],
        [
          'Creators contacted',
          data.creators_contacted,
          '◉',
        ],
        [
          'Avg. engagement',
          `${data.average_engagement}%`,
          '⌁',
        ],
        [
          'Conversions',
          data.conversions,
          '✦',
        ],
      ]
    : [];


  return (
    <>

      {/* INTRO */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">

        <div>

          <p className="eyebrow mb-3">
            Campaign intelligence
          </p>

          <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
            Good morning, Aanya.
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


      {/* STAT CARDS */}
      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">

        {stats.map(([label, value, icon]) => (

          <div
            className="panel p-5"
            key={String(label)}
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
              Across your workspace
            </p>

          </div>

        ))}

      </div>


      {/* LOWER DASHBOARD */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">

        {/* RECENT CAMPAIGNS */}
        <section className="panel overflow-hidden">

          <div className="flex items-center justify-between border-b border-[#edf0eb] px-6 py-5">

            <div>

              <p className="eyebrow mb-1">
                Campaigns
              </p>

              <h2 className="font-display text-lg font-semibold text-[#173c32]">
                Recent activity
              </h2>

            </div>

            <Link
              to="/campaign"
              className="text-xs font-bold text-[#58766a]"
            >
              New campaign ↗
            </Link>

          </div>


          {data?.recent_campaigns.map((campaign) => (

            <div
              className="flex flex-col gap-3 border-b border-[#edf0eb] px-6 py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              key={campaign.campaign_id}
            >

              <div>

                <p className="font-semibold text-[#29463b]">
                  {campaign.name}
                </p>

                <p className="mt-1 text-xs text-[#89958e]">
                  {campaign.product}
                  {' · '}
                  {campaign.location}
                  {' · '}
                  {campaign.creators_count} creators
                </p>

              </div>


              <div className="flex items-center gap-5">

                <div className="text-right">

                  <p className="text-xs font-semibold text-[#405c50]">
                    ₹{campaign.budget.toLocaleString('en-IN')}
                  </p>

                  <p className="mt-1 text-[10px] text-[#9ba59f]">
                    {campaign.status}
                  </p>

                </div>


                <span className="rounded-full bg-[#edf5d5] px-2.5 py-1 text-[10px] font-bold text-[#547224]">
                  {campaign.memory_status}
                </span>

              </div>

            </div>

          ))}

        </section>


        {/* MEMORY */}
        <section className="relative overflow-hidden rounded-2xl bg-[#173c32] p-7 text-white">

          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[22px] border-[#416b58]/40" />

          <div className="relative">

            <div className="mb-8 flex items-center justify-between">

              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#d5ed78] text-lg text-[#173c32]">
                ✦
              </span>

              <span className="rounded-full border border-[#537463] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[#c6d9c8]">
                AI learning
              </span>

            </div>


            <p className="eyebrow text-[#8fb399]">
              Latest campaign learning
            </p>

            <p className="mt-3 font-display text-xl leading-8 tracking-[-0.04em]">
              “{data?.latest_learning?.statement}”
            </p>

            <div className="mt-8 border-t border-[#416454] pt-4 text-xs text-[#a6bdb0]">
              {data?.latest_learning?.source_campaign}
              {' · '}
              CampaignMind learning
            </div>

          </div>

        </section>

      </div>

    </>
  );
}


/* =========================================================
   CAMPAIGN PAGE
========================================================= */

function Campaign() {

  const [form, setForm] =
    useState<CampaignRequest>(emptyForm);

  const [result, setResult] =
    useState<CampaignResponse | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');


  const update = (
    key: keyof CampaignRequest,
    value: string | number
  ) => {

    setForm((current) => ({
      ...current,
      [key]: value,
    }));

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

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

    } catch (cause) {

      setError(
        cause instanceof N8nApiError
          ? cause.message
          : 'Campaign search could not be completed.'
      );

    } finally {

      setLoading(false);

    }

  }


  return (
    <>

      {/* PAGE HEADER */}
      <div className="mb-8">

        <p className="eyebrow mb-3">
          Campaign intelligence
        </p>

        <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#173c32] md:text-4xl">
          Find your next best creators.
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-[#78857e]">
          Tell CampaignMind what your brand needs. The AI will analyze your
          requirements and suggest influencers who fit your campaign.
        </p>

      </div>


      {/* CAMPAIGN FORM */}
      <form
        onSubmit={submit}
        className="grid gap-6 xl:grid-cols-[1fr_330px]"
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
              CampaignMind will analyze your brief before recommending creators.
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


        {/* WHAT HAPPENS */}
        <aside className="space-y-4">

          <div className="rounded-2xl border border-[#d8e6c1] bg-[#f2f8e3] p-6">

            <div className="mb-6 flex items-center gap-3">

              <span className="text-xl text-[#6f943b]">
                ✦
              </span>

              <p className="font-display font-semibold text-[#355022]">
                How CampaignMind works
              </p>

            </div>


            <div className="space-y-5">

              {[
                'Understand your campaign',
                'Find suitable creators',
                'Analyze previous campaign learning',
                'Rank the best matches',
              ].map((label, index) => (

                <div
                  className="flex gap-3"
                  key={label}
                >

                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-[#6f943b]">
                    0{index + 1}
                  </span>

                  <p className="pt-1 text-xs leading-5 text-[#5d7547]">
                    {label}
                  </p>

                </div>

              ))}

            </div>

          </div>


          <div className="rounded-2xl border border-[#e1e7e1] bg-white p-5">

            <p className="eyebrow mb-2">
              AI matching
            </p>

            <p className="text-sm font-semibold text-[#29463b]">
              Recommendations are based on your campaign requirements.
            </p>

            <p className="mt-2 text-xs leading-5 text-[#89958e]">
              Later, campaign engagement and sales results can be used to
              improve future recommendations.
            </p>

          </div>

        </aside>

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

  const recommendations =
    Array.isArray(result.recommendations)
      ? result.recommendations
      : [];


  const aiOutput =
    typeof (result as CampaignResponse & {
      output?: unknown;
    }).output === 'string'
      ? (result as CampaignResponse & {
          output?: string;
        }).output
      : '';


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

            {recommendations.map((creator) => (

              <CreatorCard
                creator={creator}
                key={creator.creator_id}
              />

            ))}

          </div>

        </>

      ) : (

        <div className="panel p-6">

          <p className="eyebrow mb-2">
            AI campaign analysis
          </p>

          <h2 className="font-display text-xl font-semibold text-[#173c32]">
            CampaignMind response
          </h2>


          {aiOutput ? (

            <div className="mt-5 whitespace-pre-wrap rounded-xl bg-[#fbfcfa] p-5 text-sm leading-7 text-[#405c50]">
              {aiOutput}
            </div>

          ) : (

            <div className="mt-5 rounded-xl border border-[#ead9a9] bg-[#fff9e8] p-5 text-sm leading-6 text-[#92712d]">
              The AI response was received, but it did not contain structured
              creator recommendations yet.
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
}: {
  creator: NonNullable<
    CampaignResponse['recommendations']
  >[number];
}) {

  return (
    <article className="panel overflow-hidden">

      <div className="flex items-start justify-between border-b border-[#edf0eb] p-5">

        <div className="flex items-center gap-3">

          <div className="grid h-11 w-11 place-items-center rounded-full bg-[#dce9d2] font-display font-semibold text-[#41623f]">

            {creator.name
              .split(' ')
              .map((part) => part[0])
              .join('')}

          </div>


          <div>

            <h2 className="font-semibold text-[#29463b]">
              {creator.name}
            </h2>

            <p className="mt-0.5 text-xs text-[#89958e]">
              {creator.platform}
              {' · '}
              {creator.location}
            </p>

          </div>

        </div>


        <span className="rounded-full bg-[#edf5d5] px-2.5 py-1 text-xs font-bold text-[#547224]">
          {creator.match_score}%
        </span>

      </div>


      <div className="p-5">

        <div className="mb-5 grid grid-cols-2 gap-3">

          <Metric
            label="Followers"
            value={`${(
              (creator.followers ?? 0) / 1000
            ).toFixed(0)}K`}
          />

          <Metric
            label="Engagement"
            value={`${creator.engagement_rate ?? 0}%`}
          />

        </div>


        <div className="mb-5 rounded-xl bg-[#fbfcfa] p-3">

          <p className="eyebrow mb-2">
            Why recommended
          </p>

          {creator.reasons.map((reason) => (

            <p
              className="mt-1.5 text-xs text-[#5d6e65]"
              key={reason}
            >
              <span className="mr-1.5 text-[#7a9a55]">
                ✓
              </span>

              {reason}
            </p>

          ))}

        </div>


        <div className="flex items-end justify-between border-t border-[#edf0eb] pt-4">

          <div>

            <p className="eyebrow">
              Estimated collaboration cost
            </p>

            <p className="mt-1 font-display text-lg font-semibold text-[#29463b]">
              ₹{creator.estimated_price?.toLocaleString('en-IN')}
            </p>

            <p className="mt-0.5 text-[10px] text-[#9aa59f]">
              Data status: {creator.data_status}
            </p>

          </div>


          <button
            type="button"
            className="rounded-lg border border-[#cad8c9] px-3 py-2 text-xs font-semibold text-[#41623f] transition hover:bg-[#f2f8e3]"
          >
            Select creator
          </button>

        </div>

      </div>

    </article>
  );
}


/* =========================================================
   ENGAGEMENT
========================================================= */

function Engagement() {

  const metrics = [
    ['Reach', '125.4K'],
    ['Views', '82.3K'],
    ['Likes', '6,840'],
    ['Comments', '290'],
    ['Shares', '412'],
    ['Saves', '730'],
  ];


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
              Aarav Moves · Instagram Reel
            </p>

          </div>


          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#547224]">
            Live performance
          </span>

        </div>

      </div>


      {/* METRICS */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">

        {metrics.map(([label, value]) => (

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
              Current campaign
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

            <h2 className="font-display text-lg font-semibold text-[#173c32]">
              Reel performance
            </h2>

          </div>


          <div className="flex h-[260px] items-end gap-3 border-b border-l border-[#dfe6df] px-4 pb-0">

            {[22, 34, 43, 58, 72, 84, 96].map(
              (height, index) => (

                <div
                  key={index}
                  className="group flex h-full flex-1 items-end"
                >

                  <div
                    className="w-full rounded-t-lg bg-[#b8cf91] transition group-hover:bg-[#7e9d75]"
                    style={{
                      height: `${height}%`,
                    }}
                  />

                </div>

              )
            )}

          </div>


          <div className="mt-3 flex justify-between px-4 text-[10px] text-[#9aa59f]">
            <span>Day 1</span>
            <span>Day 2</span>
            <span>Day 3</span>
            <span>Day 4</span>
            <span>Day 5</span>
            <span>Day 6</span>
            <span>Day 7</span>
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
            8.3%
          </p>

          <p className="mt-4 text-xs leading-5 text-[#a6bdb0]">
            Calculated from the current reel's interactions and reach.
          </p>

        </section>

      </div>

    </>
  );
}


/* =========================================================
   SALES & ROI
========================================================= */

function Sales() {

  const influencers = [
    {
      name: 'Aarav Moves',
      code: 'AARAV20',
      orders: 127,
      revenue: 63500,
    },
    {
      name: 'Nisha Notes',
      code: 'NISHA20',
      orders: 74,
      revenue: 37000,
    },
    {
      name: 'The Daily Lift',
      code: 'LIFT20',
      orders: 46,
      revenue: 23000,
    },
  ];


  return (
    <>

      <PageHeader
        eyebrow="Campaign revenue"
        title="Sales & ROI"
        description="Track purchases generated through influencer promo codes and understand campaign return."
      />


      {/* TOP METRICS */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">

        <SalesMetric
          label="Orders"
          value="247"
          note="Promo-code purchases"
        />

        <SalesMetric
          label="Revenue"
          value="₹1,23,500"
          note="Attributed campaign revenue"
        />

        <SalesMetric
          label="Campaign cost"
          value="₹30,000"
          note="Creator collaboration cost"
        />

        <SalesMetric
          label="ROI"
          value="3.12x"
          note="Revenue ÷ campaign cost"
          highlight
        />

      </div>


      {/* TABLE */}
      <section className="panel overflow-hidden">

        <div className="border-b border-[#edf0eb] px-6 py-5">

          <p className="eyebrow mb-1">
            Promo code performance
          </p>

          <h2 className="font-display text-lg font-semibold text-[#173c32]">
            Sales by influencer
          </h2>

        </div>


        <div className="overflow-x-auto">

          <table className="w-full text-left">

            <thead className="bg-[#fbfcfa]">

              <tr>

                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#89958e]">
                  Influencer
                </th>

                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#89958e]">
                  Promo code
                </th>

                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#89958e]">
                  Orders
                </th>

                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[#89958e]">
                  Revenue
                </th>

              </tr>

            </thead>


            <tbody>

              {influencers.map((creator) => (

                <tr
                  key={creator.code}
                  className="border-t border-[#edf0eb]"
                >

                  <td className="px-6 py-5">

                    <p className="text-sm font-semibold text-[#29463b]">
                      {creator.name}
                    </p>

                  </td>

                  <td className="px-6 py-5">

                    <span className="rounded-full bg-[#edf5d5] px-3 py-1.5 text-[10px] font-bold text-[#547224]">
                      {creator.code}
                    </span>

                  </td>

                  <td className="px-6 py-5 text-sm font-semibold text-[#405c50]">
                    {creator.orders}
                  </td>

                  <td className="px-6 py-5 text-sm font-semibold text-[#405c50]">
                    ₹{creator.revenue.toLocaleString('en-IN')}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </section>


      {/* NOTE */}
      <div className="mt-6 rounded-2xl border border-[#e1e7e1] bg-white p-5">

        <p className="eyebrow mb-2">
          Why Sales & ROI
        </p>

        <p className="text-sm leading-6 text-[#5d6e65]">
          Promo codes allow CampaignMind to connect influencer activity
          directly to purchases. This gives the AI a measurable campaign
          outcome to learn from.
        </p>

      </div>

    </>
  );
}


/* =========================================================
   PROFILE
========================================================= */

function Profile() {

  return (
    <>

      <PageHeader
        eyebrow="Workspace settings"
        title="Profile"
        description="Manage the brand information used across your CampaignMind workspace."
      />


      <section className="panel max-w-3xl p-6 md:p-8">

        <div className="mb-8 flex items-center gap-4">

          <div className="grid h-16 w-16 place-items-center rounded-full bg-[#e4cfaa] text-lg font-bold text-[#5b4227]">
            AS
          </div>

          <div>

            <h2 className="font-display text-xl font-semibold text-[#173c32]">
              Aanya Sharma
            </h2>

            <p className="mt-1 text-xs text-[#89958e]">
              Brand workspace
            </p>

          </div>

        </div>


        <div className="grid gap-5 md:grid-cols-2">

          <ProfileField
            label="Name"
            value="Aanya Sharma"
          />

          <ProfileField
            label="Company"
            value="Your Brand"
          />

          <ProfileField
            label="Email"
            value="aanya@brand.com"
          />

          <ProfileField
            label="Default location"
            value="Hyderabad"
          />

        </div>


        <div className="mt-8 border-t border-[#edf0eb] pt-6">

          <button
            type="button"
            className="rounded-xl bg-[#173c32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245445]"
          >
            Save changes
          </button>

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
