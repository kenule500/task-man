import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { updateStoredUser, getStoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  Target,
  User,
  Sparkles,
} from 'lucide-react';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    role: '',
    useCase: '',
    teamSize: '',
    workspaceName: '',
  });

  const { user } = useAuthGuard({ requireOnboarding: false });

  // ============================================================
  // GUARD: If user is already onboarded, send them to their workspace
  // ============================================================
  useEffect(() => {
    if (user?.onboardingComplete && user.activeWorkspaceSlug) {
      navigate(`/${user.activeWorkspaceSlug}/dashboard`, { replace: true });
    }
  }, [navigate, user]);

  // ============================================================
  // NAVIGATION BETWEEN STEPS
  // ============================================================
  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
      return;
    }

    // Final step — save everything
    setSaving(true);
    try {
      const response = await api.post('/auth/onboarding', formData);
      const workspace = response.data.workspace;

      // If the backend returned an existing workspace (idempotency case),
      // we still need the slug.
      if (!workspace?.slug) {
        console.error('Onboarding response missing workspace slug');
        navigate('/dashboard');
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
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      console.error('Failed to save onboarding:', axiosError.response?.data?.message);
      // Still let them through on soft failure
      navigate('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // ============================================================
  // STEP OPTIONS
  // ============================================================
  const roles = [
    { value: 'developer', label: 'Developer', icon: User },
    { value: 'designer', label: 'Designer', icon: Target },
    { value: 'manager', label: 'Manager', icon: Briefcase },
    { value: 'founder', label: 'Founder', icon: Target },
  ];

  const useCases = [
    { value: 'personal', label: 'Personal tasks', desc: 'Track my own to-dos' },
    { value: 'team', label: 'Team projects', desc: 'Collaborate with my team' },
    { value: 'clients', label: 'Client work', desc: 'Manage multiple clients' },
    { value: 'study', label: 'Study planning', desc: 'Organize my learning' },
  ];

  const teamSizes = ['Just me', '2-5 people', '6-20 people', '20+ people'];

  const canProceed = () => {
    if (step === 1) return !!formData.role;
    if (step === 2) return !!formData.useCase;
    if (step === 3) return !!formData.teamSize;
    if (step === 4) return formData.workspaceName.trim().length >= 2;
    return false;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 max-w-2xl w-full">
        {/* Progress Bar */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s <= step ? 'w-12 bg-primary' : 'w-6 bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* ============================== STEP 1: Role ============================== */}
        {step === 1 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">
              Welcome, {user?.name}! 🎉
            </h1>
            <p className="text-slate-500 mb-10 max-w-md mx-auto">
              You're all set up. Let's personalize your workspace with a few quick questions.
            </p>

            <div className="space-y-2 text-left max-w-md mx-auto mb-10">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                What best describes you?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {roles.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.value;
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, role: role.value })}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected ? 'text-primary' : 'text-slate-400'
                        }`}
                      />
                      <span className="font-medium text-slate-900 text-sm">
                        {role.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================== STEP 2: Use Case ============================== */}
        {step === 2 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              What will you use TaskMan for?
            </h1>
            <p className="text-slate-500 mb-10">This helps us tailor your experience.</p>

            <div className="space-y-3 max-w-md mx-auto mb-10">
              {useCases.map((uc) => {
                const isSelected = formData.useCase === uc.value;
                return (
                  <button
                    key={uc.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, useCase: uc.value })}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-primary bg-primary' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{uc.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{uc.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================== STEP 3: Team Size ============================== */}
        {step === 3 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Briefcase className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              How big is your team?
            </h1>
            <p className="text-slate-500 mb-10">Just so we can customize your dashboard.</p>

            <div className="space-y-3 max-w-md mx-auto mb-10">
              {teamSizes.map((size) => {
                const isSelected = formData.teamSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setFormData({ ...formData, teamSize: size })}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="font-medium text-slate-900 text-sm">{size}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================== STEP 4: Name Workspace ============================== */}
        {step === 4 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              Name your workspace
            </h1>
            <p className="text-slate-500 mb-10">
              This is where your tasks live. You can invite teammates later.
            </p>

            <div className="max-w-md mx-auto mb-10 text-left space-y-2">
              <Label
                htmlFor="workspaceName"
                className="text-sm font-medium text-slate-700"
              >
                Workspace Name
              </Label>
              <Input
                id="workspaceName"
                type="text"
                placeholder="e.g., Acme Corp, My Team, Personal"
                value={formData.workspaceName}
                onChange={(e) =>
                  setFormData({ ...formData, workspaceName: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canProceed()) handleNext();
                }}
                autoFocus
                className="h-12 bg-slate-50 border-slate-200 rounded-xl text-base"
                maxLength={60}
              />
              <p className="text-xs text-slate-400">
                You can rename this anytime in Settings.
              </p>
            </div>
          </div>
        )}

        {/* ============================== NAVIGATION ============================== */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={step === 1 || saving}
            className="rounded-xl gap-2 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || saving}
            className="rounded-xl gap-2 bg-primary hover:bg-primary-hover text-white px-6"
          >
            {saving ? 'Creating workspace...' : step === 4 ? 'Finish' : 'Continue'}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;