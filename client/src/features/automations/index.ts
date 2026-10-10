// Public surface of the automations module (rules: when / if / then)
export * from './types';
export { automationsApi } from './api';
export { useAutomations } from './hooks/useAutomations';
export * from './lib/describe';
export * from './lib/draft';
export { RuleBuilder } from './components/RuleBuilder';
export { RuleList } from './components/RuleList';
export { RuleSwitch } from './components/RuleSwitch';
export { TemplateGallery } from './components/TemplateGallery';
