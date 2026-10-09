import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { updateStoredUser, getStoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, IconTile, ProgressBar, fieldMessageId } from '@/components/ds';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  Loader2,
  Target,
  User,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const STEP_COUNT = 4;

const ROLES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'developer', label: 'Developer', icon: User },
  { value: 'designer', label: 'Designer', icon: Target },
  { value: 'manager', label: 'Manager', icon: Briefcase },
  { value: 'founder', label: 'Founder', icon: Target },
];

const USE_CASES = [
  { value: 'personal', label: 'Personal tasks', desc: 'Track my own to-dos' },
  { value: 'team', label: 'Team projects', desc: 'Collaborate with my team' },
  { value: 'clients', label: 'Client work', desc: 'Manage multiple clients' },
  { value: 'study', label: 'Study planning', desc: 'Organize my learning' },
];

const TEAM_SIZES = ['Just me', '2-5 people', '6-20 people', '20+ people'];

const OPTION_BASE =
  'rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const optionClass = (selected: boolean) =>
  cn(OPTION_BASE, selected ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:border-slate-300');

interface StepHeadingProps {
  icon: ReactNode;
  title: string;
  description: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

const StepHeading = ({ icon, title, description, headingRef }: StepHeadingProps) => (
  <>
    <IconTile size="lg" className="mx-auto mb-6 size-20 rounded-3xl [&_svg]:size-10">
      {icon}
    </IconTile>
    <h1 ref={headingRef} tabIndex={-1} className="mb-3 text-2xl font-bold tracking-tight text-slate-900 outline-none sm:text-3xl">
      {title}
    </h1>
    <p className="mx-auto mb-8 max-w-md text-slate-600 sm:mb-10">{description}</p>
  </>
);

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    role: '',
    useCase: '',
    teamSize: '',
    workspaceName: '',
  });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { user } = useAuthGuard({ requireOnboarding: false });

  // If the user is already onboarded, send them to their workspace
  useEffect(() => {
    if (user?.onboardingComplete && user.activeWorkspaceSlug) {
      navigate(`/${user.activeWorkspaceSlug}/dashboard`, { replace: true });
    }
  }, [navigate, user]);

  // Move focus to the new step's heading so keyboard and screen reader users follow along
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // The last step autofocuses its input instead
    if (step < STEP_COUNT) headingRef.current?.focus();
  }, [step]);

  const canProceed = () => {
    if (step === 1) return !!formData.role;
    if (step === 2) return !!formData.useCase;
    if (step === 3) return !!formData.teamSize;
    if (step === 4) return formData.workspaceName.trim().length >= 2;
    return false;
  };

  const handleNext = async () => {
    if (!canProceed()) return;
    if (step < STEP_COUNT) {
      setStep(step + 1);
      return;
    }

    // Final step — save everything
    setSaving(true);
    setError('');
    try {
      const response = await api.post('/auth/onboarding', { ...formData, workspaceName: formData.workspaceName.trim() });
      const workspace = response.data.workspace;

      if (!workspace?.slug) {
        setError('Your workspace was created but we could not open it. Sign in again to continue.');
        return;
      }

      // Update stored user with the workspace info
      const workspaces = getStoredUser()?.workspaces || [];
      updateStoredUser({
        onboardingComplete: true,
        activeWorkspace: workspace._id,
        activeWorkspaceSlug: workspace.slug,
        workspaces: workspaces.includes(workspace._id) ? workspaces : [...workspaces, workspace._id],
      });

      navigate(`/${workspace.slug}/dashboard`, { replace: true });
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'We could not create your workspace. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <AuthPageShell wide>
      <div className="mb-8 sm:mb-10">
        <p className="mb-2 text-center text-xs font-medium text-slate-600">
          Step {step} of {STEP_COUNT}
        </p>
        <ProgressBar value={(step / STEP_COUNT) * 100} label={`Onboarding progress, step ${step} of ${STEP_COUNT}`} className="mx-auto max-w-xs" />
      </div>

      <div className="text-center">
        {/* ============================== STEP 1: Role ============================== */}
        {step === 1 && (
          <>
            <StepHeading
              headingRef={headingRef}
              icon={<CheckCircle2 />}
              title={`Welcome${user?.name ? `, ${user.name.trim().split(/\s+/)[0]}` : ''}`}
              description="You are all set up. Answer a few quick questions to personalize your workspace."
            />
            <fieldset className="mx-auto mb-8 max-w-md text-left sm:mb-10">
              <legend className="mb-4 text-sm font-semibold text-slate-800">What best describes you?</legend>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map(({ value, label, icon: Icon }) => {
                  const selected = formData.role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setFormData({ ...formData, role: value })}
                      className={cn(optionClass(selected), 'flex min-h-14 items-center gap-3')}
                    >
                      <Icon className={cn('size-5', selected ? 'text-primary' : 'text-slate-500')} aria-hidden />
                      <span className="text-sm font-medium text-slate-900">{label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        {/* ============================== STEP 2: Use Case ============================== */}
        {step === 2 && (
          <>
            <StepHeading headingRef={headingRef} icon={<Target />} title="What will you use TaskMan for?" description="This helps us tailor your experience." />
            <div className="mx-auto mb-8 max-w-md space-y-3 sm:mb-10">
              {USE_CASES.map((useCase) => {
                const selected = formData.useCase === useCase.value;
                return (
                  <button
                    key={useCase.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormData({ ...formData, useCase: useCase.value })}
                    className={cn(optionClass(selected), 'flex min-h-14 w-full items-start gap-4')}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-primary bg-primary' : 'border-slate-400',
                      )}
                    >
                      {selected && <span className="size-2 rounded-full bg-white" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{useCase.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">{useCase.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ============================== STEP 3: Team Size ============================== */}
        {step === 3 && (
          <>
            <StepHeading headingRef={headingRef} icon={<Briefcase />} title="How big is your team?" description="Just so we can customize your dashboard." />
            <div className="mx-auto mb-8 max-w-md space-y-3 sm:mb-10">
              {TEAM_SIZES.map((size) => {
                const selected = formData.teamSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormData({ ...formData, teamSize: size })}
                    className={cn(optionClass(selected), 'block min-h-14 w-full')}
                  >
                    <span className="text-sm font-medium text-slate-900">{size}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ============================== STEP 4: Name Workspace ============================== */}
        {step === 4 && (
          <>
            <StepHeading
              headingRef={headingRef}
              icon={<Sparkles />}
              title="Name your workspace"
              description="This is where your tasks live. You can invite teammates later."
            />
            {error && <Alert tone="error" className="mx-auto mb-6 max-w-md text-left">{error}</Alert>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
            >
              <Field
                label="Workspace name"
                htmlFor="workspaceName"
                required
                hint="At least 2 characters. You can rename it anytime in Settings."
                className="mx-auto mb-8 max-w-md text-left sm:mb-10"
              >
                <Input
                  id="workspaceName"
                  name="workspaceName"
                  aria-describedby={fieldMessageId('workspaceName')}
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="e.g. Acme Corp, My Team, Personal"
                  value={formData.workspaceName}
                  onChange={(e) => setFormData({ ...formData, workspaceName: e.target.value })}
                  autoFocus
                  className="h-12 rounded-xl border-slate-300 bg-white text-base md:text-base"
                  maxLength={60}
                />
              </Field>
            </form>
          </>
        )}
      </div>

      {/* ============================== NAVIGATION ============================== */}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6 sm:mt-10">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={step === 1 || saving}
          className="h-11 gap-2 rounded-xl text-slate-700"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Button>

        <Button
          onClick={handleNext}
          disabled={!canProceed() || saving}
          className="h-11 gap-2 rounded-xl bg-primary px-6 text-white hover:bg-primary-hover"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Creating workspace...
            </>
          ) : (
            <>
              {step === STEP_COUNT ? 'Create workspace' : 'Continue'}
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </AuthPageShell>
  );
};

export default OnboardingPage;
