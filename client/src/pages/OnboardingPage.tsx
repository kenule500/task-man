import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { updateStoredUser, getStoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, Field, IconTile, Stepper, fieldMessageId, Spinner } from '@/components/ds';
import { AuthPageShell } from '@/components/auth/AuthPageShell';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  Target,
  User,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const STEP_COUNT = 4;

const STEP_IDS = ['role', 'use-case', 'team-size', 'workspace'] as const;

const ROLES: { value: string; icon: LucideIcon }[] = [
  { value: 'developer', icon: User },
  { value: 'designer', icon: Target },
  { value: 'manager', icon: Briefcase },
  { value: 'founder', icon: Target },
];

const USE_CASES = ['personal', 'team', 'clients', 'study'] as const;

// The value is stored on the account in English; the label shown is translated
const TEAM_SIZES = [
  { value: 'Just me', key: 'solo' },
  { value: '2-5 people', key: 'small' },
  { value: '6-20 people', key: 'medium' },
  { value: '20+ people', key: 'large' },
] as const;

const OPTION_BASE =
  'rounded-xl border-2 p-4 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
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
  const { t } = useTranslation('auth');
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
        setError(t('onboarding.openFailed'));
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
      setError(axiosError.response?.data?.message || t('onboarding.createFailed'));
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
          {t('onboarding.step', { step, total: STEP_COUNT })}
        </p>
        <Stepper steps={STEP_IDS.map((id) => ({ id, title: t(`onboarding.steps.${id}`) }))} current={step - 1} size="sm" label={t('onboarding.progress')} className="mx-auto max-w-md" />
      </div>

      <div className="text-center">
        {/* ============================== STEP 1: Role ============================== */}
        {step === 1 && (
          <>
            <StepHeading
              headingRef={headingRef}
              icon={<CheckCircle2 />}
              title={user?.name ? t('onboarding.welcomeName', { name: user.name.trim().split(/\s+/)[0] }) : t('onboarding.welcome')}
              description={t('onboarding.welcomeDescription')}
            />
            <fieldset className="mx-auto mb-8 max-w-md text-start sm:mb-10">
              <legend className="mb-4 text-sm font-semibold text-slate-800">{t('onboarding.whoAreYou')}</legend>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map(({ value, icon: Icon }) => {
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
                      <span className="text-sm font-medium text-slate-900">{t(`onboarding.roles.${value}`)}</span>
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
            <StepHeading headingRef={headingRef} icon={<Target />} title={t('onboarding.useCaseTitle')} description={t('onboarding.useCaseDescription')} />
            <div className="mx-auto mb-8 max-w-md space-y-3 sm:mb-10">
              {USE_CASES.map((useCase) => {
                const selected = formData.useCase === useCase;
                return (
                  <button
                    key={useCase}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormData({ ...formData, useCase })}
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
                      <span className="block text-sm font-medium text-slate-900">{t(`onboarding.useCases.${useCase}.label`)}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">{t(`onboarding.useCases.${useCase}.desc`)}</span>
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
            <StepHeading headingRef={headingRef} icon={<Briefcase />} title={t('onboarding.teamTitle')} description={t('onboarding.teamDescription')} />
            <div className="mx-auto mb-8 max-w-md space-y-3 sm:mb-10">
              {TEAM_SIZES.map((size) => {
                const selected = formData.teamSize === size.value;
                return (
                  <button
                    key={size.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormData({ ...formData, teamSize: size.value })}
                    className={cn(optionClass(selected), 'block min-h-14 w-full')}
                  >
                    <span className="text-sm font-medium text-slate-900">{t(`onboarding.teamSizes.${size.key}`)}</span>
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
              title={t('onboarding.workspaceTitle')}
              description={t('onboarding.workspaceDescription')}
            />
            {error && <Alert tone="error" className="mx-auto mb-6 max-w-md text-start">{error}</Alert>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
            >
              <Field
                label={t('onboarding.workspaceName')}
                htmlFor="workspaceName"
                required
                hint={t('onboarding.workspaceHint')}
                className="mx-auto mb-8 max-w-md text-start sm:mb-10"
              >
                <Input
                  id="workspaceName"
                  name="workspaceName"
                  aria-describedby={fieldMessageId('workspaceName')}
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder={t('onboarding.workspacePlaceholder')}
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
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /> {t('onboarding.back')}
        </Button>

        <Button
          onClick={handleNext}
          disabled={!canProceed() || saving}
          className="h-11 gap-2 rounded-xl bg-primary px-6 text-white hover:bg-primary-hover"
        >
          {saving ? (
            <>
              <Spinner decorative /> {t('onboarding.creating')}
            </>
          ) : (
            <>
              {step === STEP_COUNT ? t('onboarding.create') : t('onboarding.continue')}
              <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </AuthPageShell>
  );
};

export default OnboardingPage;
