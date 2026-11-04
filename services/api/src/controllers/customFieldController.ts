import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import CustomField, {
  CUSTOM_FIELD_COLORS,
  CUSTOM_FIELD_TYPES,
  FIELD_KEY_PATTERN,
  ICustomField,
  ICustomFieldOption,
  MAX_ACTIVE_FIELDS,
  MAX_FIELD_NAME,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_OPTION_LABEL,
  MAX_FIELD_PROJECTS,
  type CustomFieldColor,
} from '../models/customFieldModel.js';
import Task from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import { fieldPath, newOptionId, slugFromName } from '../utils/customFields.js';
import { handleError, hasValidationErrors, TaskRuleError, workspaceOf } from './taskController.js';

// ================================================================
// Validation
// ================================================================
const optionRules = () => [
  body('options').optional().isArray({ max: MAX_FIELD_OPTIONS }).withMessage(`A field can have at most ${MAX_FIELD_OPTIONS} options`),
  body('options.*.label').isString().trim().isLength({ min: 1, max: MAX_FIELD_OPTION_LABEL })
    .withMessage(`Option names are required (up to ${MAX_FIELD_OPTION_LABEL} characters)`),
  body('options.*.color').optional().isIn(CUSTOM_FIELD_COLORS).withMessage('Invalid option color'),
  body('options.*.id').optional().isString().isLength({ max: 16 }).withMessage('Invalid option id'),
];

const sharedRules = () => [
  ...optionRules(),
  body('projects').optional().isArray({ max: MAX_FIELD_PROJECTS }).withMessage('Projects must be a list'),
  body('projects.*').isString().trim().isLength({ min: 1, max: 60 }).withMessage('Invalid project name'),
  body('required').optional().isBoolean({ strict: true }).withMessage('required must be true or false'),
];

const nameRule = () =>
  body('name').isString().trim().isLength({ min: 1, max: MAX_FIELD_NAME }).withMessage(`Name is required (up to ${MAX_FIELD_NAME} characters)`);

export const validateCreateField = [
  nameRule(),
  body('type').isIn(CUSTOM_FIELD_TYPES).withMessage('Invalid field type'),
  body('key').optional().isString().matches(FIELD_KEY_PATTERN).withMessage('The key must be lower-case letters, digits and underscores, starting with a letter'),
  ...sharedRules(),
];

export const validateUpdateField = [
  nameRule().optional(),
  body('archived').optional().isBoolean({ strict: true }).withMessage('archived must be true or false'),
  ...sharedRules(),
];

export const validateFieldOrder = [
  body('ids').isArray({ min: 1, max: 100 }).withMessage('ids must be a list'),
  body('ids.*').isMongoId().withMessage('Invalid field id'),
];

// ================================================================
// Helpers
// ================================================================
const hasOptions = (type: string) => type === 'select' || type === 'multiselect';

const present = (doc: ICustomField) => ({
  _id: String(doc._id),
  key: doc.key,
  name: doc.name,
  type: doc.type,
  options: doc.options.map(option => ({ id: option.id, label: option.label, color: option.color })),
  projects: [...doc.projects],
  required: doc.required,
  order: doc.order,
  archived: doc.archived,
});

const fieldIdOf = (req: Request): mongoose.Types.ObjectId | null => {
  const id = String(req.params.id);
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
};

const findField = (req: Request) => {
  const id = fieldIdOf(req);
  return id ? CustomField.findOne({ _id: id, workspace: workspaceOf(req)._id }) : null;
};

const uniqueProjects = (value: unknown): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const name = String(item).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
};

/**
 * Options from a request. Items with the id of an existing option keep it (rename, recolor); items without
 * an id are new; existing options that are missing from the list are removed by the caller.
 */
const normalizeOptions = (value: unknown, existing: readonly ICustomFieldOption[]): ICustomFieldOption[] => {
  const known = new Set(existing.map(option => option.id));
  const used = new Set<string>();
  const labels = new Set<string>();
  const result: ICustomFieldOption[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const item = raw as { id?: unknown; label?: unknown; color?: unknown };
    const label = String(item.label).trim();
    if (labels.has(label.toLowerCase())) throw new TaskRuleError(`Option "${label}" appears twice`);
    labels.add(label.toLowerCase());
    let id: string;
    if (item.id !== undefined) {
      id = String(item.id);
      if (!known.has(id) || used.has(id)) throw new TaskRuleError('Unknown option');
    } else {
      do id = newOptionId(); while (known.has(id) || used.has(id));
    }
    used.add(id);
    const color = CUSTOM_FIELD_COLORS.includes(item.color as CustomFieldColor) ? (item.color as CustomFieldColor) : 'slate';
    result.push({ id, label, color });
  }
  return result;
};

const describeOptions = (options: readonly ICustomFieldOption[]) => options.map(option => option.label).join(', ');

// ================================================================
// @desc    The fields of the workspace (archived ones included), in display order
// @route   GET /api/workspaces/:slug/fields   (tasks:read)
// ================================================================
export const listFields = async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = await CustomField.find({ workspace: workspaceOf(req)._id }).sort({ order: 1, createdAt: 1 });
    res.status(200).json(fields.map(present));
  } catch (error) {
    handleError(res, error, 'listFields');
  }
};

// ================================================================
// @desc    Create a field
// @route   POST /api/workspaces/:slug/fields   (settings:manage)
// @body    { name, type, key?, options?, projects?, required? }
// ================================================================
export const createField = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const type = String(req.body.type) as ICustomField['type'];
    const options = normalizeOptions(req.body.options, []);
    if (options.length > 0 && !hasOptions(type)) throw new TaskRuleError('Only select fields have options');

    const existing = await CustomField.find({ workspace: workspaceId }).select('key order archived').lean();
    if (existing.filter(field => !field.archived).length >= MAX_ACTIVE_FIELDS) {
      throw new TaskRuleError(`A workspace can have at most ${MAX_ACTIVE_FIELDS} fields. Archive or delete one first.`);
    }
    const taken = new Set(existing.map(field => field.key));
    let key: string;
    if (typeof req.body.key === 'string') {
      key = req.body.key;
      if (taken.has(key)) throw new TaskRuleError('This key is already used by another field');
    } else {
      key = slugFromName(String(req.body.name), taken);
    }

    const created = await CustomField.create({
      workspace: workspaceId,
      key,
      name: String(req.body.name).trim(),
      type,
      options,
      projects: uniqueProjects(req.body.projects),
      required: req.body.required === true,
      order: existing.reduce((max, field) => Math.max(max, field.order ?? 0), 0) + 1,
    });
    await recordActivity(req, { action: 'field.created', summary: created.name, changes: [{ field: 'type', to: type }, { field: 'key', to: key }] });
    res.status(201).json(present(created));
  } catch (error) {
    handleError(res, error, 'createField');
  }
};

/** Clears the values of removed options from the tasks that use them. */
const clearRemovedOptions = async (field: ICustomField, removedIds: string[]) => {
  if (removedIds.length === 0) return;
  const path = fieldPath(field.key);
  const workspace = field.workspace;
  if (field.type === 'select') {
    await Task.updateMany({ workspace, [path]: { $in: removedIds } }, { $unset: { [path]: '' } });
  } else {
    await Task.updateMany({ workspace, [path]: { $in: removedIds } }, { $pull: { [path]: { $in: removedIds } } });
    // A list that became empty is no value
    await Task.updateMany({ workspace, [path]: { $size: 0 } }, { $unset: { [path]: '' } });
  }
};

// ================================================================
// @desc    Rename a field, change its options (add, rename, recolor, remove), projects, required or archive it
// @route   PATCH /api/workspaces/:slug/fields/:id   (settings:manage)
// The key and type never change. Removing an option clears it from the tasks that use it.
// ================================================================
export const updateField = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const field = await findField(req);
    if (!field) {
      res.status(404).json({ message: 'Field not found' });
      return;
    }
    const changes: { field: string; from?: string; to?: string }[] = [];

    if (req.body.name !== undefined && String(req.body.name).trim() !== field.name) {
      changes.push({ field: 'name', from: field.name, to: String(req.body.name).trim() });
      field.name = String(req.body.name).trim();
    }
    if (req.body.required !== undefined && req.body.required !== field.required) {
      changes.push({ field: 'required', from: String(field.required), to: String(req.body.required) });
      field.required = req.body.required === true;
    }
    if (req.body.projects !== undefined) {
      const projects = uniqueProjects(req.body.projects);
      if (projects.join('|') !== field.projects.join('|')) {
        changes.push({ field: 'projects', from: field.projects.join(', ') || 'all', to: projects.join(', ') || 'all' });
        field.set('projects', projects);
      }
    }

    let removedIds: string[] = [];
    if (req.body.options !== undefined) {
      if (!hasOptions(field.type)) {
        if (Array.isArray(req.body.options) && req.body.options.length > 0) throw new TaskRuleError('Only select fields have options');
      } else {
        const before = field.options.map(option => ({ id: option.id, label: option.label, color: option.color }));
        const options = normalizeOptions(req.body.options, before);
        removedIds = before.filter(option => !options.some(item => item.id === option.id)).map(option => option.id);
        if (describeOptions(before) !== describeOptions(options) || JSON.stringify(before) !== JSON.stringify(options)) {
          changes.push({ field: 'options', from: describeOptions(before), to: describeOptions(options) });
          field.set('options', options);
        }
      }
    }

    if (req.body.archived !== undefined && req.body.archived !== field.archived) {
      if (req.body.archived === false) {
        const active = await CustomField.countDocuments({ workspace: field.workspace, archived: false });
        if (active >= MAX_ACTIVE_FIELDS) throw new TaskRuleError(`A workspace can have at most ${MAX_ACTIVE_FIELDS} fields. Archive or delete one first.`);
      }
      changes.push({ field: 'archived', from: String(field.archived), to: String(req.body.archived) });
      field.archived = req.body.archived === true;
    }

    await field.save();
    await clearRemovedOptions(field, removedIds);
    if (changes.length > 0) await recordActivity(req, { action: 'field.updated', summary: field.name, changes });
    res.status(200).json(present(field));
  } catch (error) {
    handleError(res, error, 'updateField');
  }
};

// ================================================================
// @desc    Put the fields in the given order (the listed ids first, in that order)
// @route   PUT /api/workspaces/:slug/fields/order   (settings:manage)
// @body    { ids }
// ================================================================
export const reorderFields = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const ids = [...new Set((req.body.ids as unknown[]).map(String))].map(id => new mongoose.Types.ObjectId(id));
    const fields = await CustomField.find({ workspace: workspaceId });
    const byId = new Map(fields.map(field => [String(field._id), field]));
    if (ids.some(id => !byId.has(String(id)))) throw new TaskRuleError('Unknown field');
    const listed = new Set(ids.map(String));
    const ordered = [...ids.map(id => byId.get(String(id))!), ...fields.filter(field => !listed.has(String(field._id)))];
    await Promise.all(ordered.map((field, index) => (field.order === index + 1
      ? null
      : CustomField.updateOne({ _id: field._id, workspace: workspaceId }, { $set: { order: index + 1 } }))));
    ordered.forEach((field, index) => { field.order = index + 1; });
    res.status(200).json(ordered.map(present));
  } catch (error) {
    handleError(res, error, 'reorderFields');
  }
};

// ================================================================
// @desc    Delete a field and the values tasks hold for it
// @route   DELETE /api/workspaces/:slug/fields/:id   (settings:manage)
// ================================================================
export const deleteField = async (req: Request, res: Response): Promise<void> => {
  try {
    const field = await findField(req);
    if (!field) {
      res.status(404).json({ message: 'Field not found' });
      return;
    }
    await field.deleteOne();
    const path = fieldPath(field.key);
    const cleared = await Task.updateMany({ workspace: field.workspace, [path]: { $exists: true } }, { $unset: { [path]: '' } });
    await recordActivity(req, {
      action: 'field.deleted',
      summary: field.name,
      changes: [{ field: 'key', from: field.key }, { field: 'values', from: String(cleared.modifiedCount) }],
    });
    res.status(200).json({ message: 'Field deleted', id: String(field._id) });
  } catch (error) {
    handleError(res, error, 'deleteField');
  }
};
