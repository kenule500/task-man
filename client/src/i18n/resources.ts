// Translation registry: one JSON file per namespace and language under ./locales/<lng>/<ns>.json.
// Add a namespace by importing its three files here (English is the fallback for missing keys).
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';
import arCommon from './locales/ar/common.json';
import enTasks from './locales/en/tasks.json';
import frTasks from './locales/fr/tasks.json';
import arTasks from './locales/ar/tasks.json';
import enProjects from './locales/en/projects.json';
import frProjects from './locales/fr/projects.json';
import arProjects from './locales/ar/projects.json';
import enPlanning from './locales/en/planning.json';
import frPlanning from './locales/fr/planning.json';
import arPlanning from './locales/ar/planning.json';
import enReports from './locales/en/reports.json';
import frReports from './locales/fr/reports.json';
import arReports from './locales/ar/reports.json';
import enAdmin from './locales/en/admin.json';
import frAdmin from './locales/fr/admin.json';
import arAdmin from './locales/ar/admin.json';
import enChat from './locales/en/chat.json';
import frChat from './locales/fr/chat.json';
import arChat from './locales/ar/chat.json';
import enNav from './locales/en/nav.json';
import frNav from './locales/fr/nav.json';
import arNav from './locales/ar/nav.json';
import enAuth from './locales/en/auth.json';
import frAuth from './locales/fr/auth.json';
import arAuth from './locales/ar/auth.json';
import enDashboard from './locales/en/dashboard.json';
import frDashboard from './locales/fr/dashboard.json';
import arDashboard from './locales/ar/dashboard.json';
import enSettings from './locales/en/settings.json';
import frSettings from './locales/fr/settings.json';
import arSettings from './locales/ar/settings.json';
import enLanding from './locales/en/landing.json';
import frLanding from './locales/fr/landing.json';
import arLanding from './locales/ar/landing.json';
import enAi from './locales/en/ai.json';
import frAi from './locales/fr/ai.json';
import arAi from './locales/ar/ai.json';
import enAiPlan from './locales/en/aiPlan.json';
import frAiPlan from './locales/fr/aiPlan.json';
import arAiPlan from './locales/ar/aiPlan.json';

export const resources = {
  en: { common: enCommon, nav: enNav, auth: enAuth, dashboard: enDashboard, settings: enSettings, landing: enLanding, tasks: enTasks, projects: enProjects, planning: enPlanning, reports: enReports, admin: enAdmin, ai: enAi, aiPlan: enAiPlan, chat: enChat },
  fr: { common: frCommon, nav: frNav, auth: frAuth, dashboard: frDashboard, settings: frSettings, landing: frLanding, tasks: frTasks, projects: frProjects, planning: frPlanning, reports: frReports, admin: frAdmin, ai: frAi, aiPlan: frAiPlan, chat: frChat },
  ar: { common: arCommon, nav: arNav, auth: arAuth, dashboard: arDashboard, settings: arSettings, landing: arLanding, tasks: arTasks, projects: arProjects, planning: arPlanning, reports: arReports, admin: arAdmin, ai: arAi, aiPlan: arAiPlan, chat: arChat },
} as const;

export const NAMESPACES = ['common', 'nav', 'auth', 'dashboard', 'settings', 'landing', 'tasks', 'projects', 'planning', 'reports', 'admin', 'ai', 'aiPlan', 'chat'] as const;
