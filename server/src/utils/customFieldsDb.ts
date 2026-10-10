import mongoose from 'mongoose';
import CustomField from '../models/customFieldModel.js';
import type { IWorkspace } from '../models/workspaceModel.js';
import { planCustomValues, type FieldDef, type PlanResult } from './customFields.js';

/** All field definitions of a workspace (archived ones included), in display order. */
export const loadFieldDefs = async (workspaceId: unknown): Promise<FieldDef[]> => {
  const docs = await CustomField.find({ workspace: new mongoose.Types.ObjectId(String(workspaceId)) })
    .sort({ order: 1, createdAt: 1 })
    .lean();
  return docs.map(doc => ({
    key: doc.key,
    name: doc.name,
    type: doc.type,
    options: doc.options ?? [],
    projects: doc.projects ?? [],
    required: doc.required,
    archived: doc.archived,
  }));
};

/** Validates the `custom` part of a task request against the workspace's fields. */
export const planRequestCustom = async (
  workspace: IWorkspace,
  input: unknown,
  mode: 'create' | 'update',
  project?: string | null,
): Promise<PlanResult & { defs: FieldDef[] }> => {
  const defs = await loadFieldDefs(workspace._id);
  const memberIds = new Set(workspace.members.map(member => member.user.toString()));
  return { ...planCustomValues(defs, input, { mode, project, memberIds }), defs };
};
