import {
  describeLastEdit, isExternalHref, isInternalHref, linkTaskKeys, mentionLinks, taskHref, type MdNode,
} from '../lib/mentions';

const links = mentionLinks([{ key: 'WEB-12', id: 't1', title: 'Fix login', status: 'pending' }], 'demo ws');

describe('taskHref', () => {
  it('opens the task through ?task= on the tasks page', () => {
    expect(taskHref('demo', 'abc')).toBe('/demo/tasks?task=abc');
    expect(taskHref('demo ws', 'a&b')).toBe('/demo%20ws/tasks?task=a%26b');
  });
});

describe('linkTaskKeys', () => {
  it('splits text around known keys and leaves unknown keys alone', () => {
    const tree: MdNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'See WEB-12, not API-3, and WEB-12 again' }] }],
    };
    linkTaskKeys(tree, links);
    const children = tree.children?.[0].children ?? [];
    expect(children.map(node => node.type)).toEqual(['text', 'link', 'text', 'link', 'text']);
    expect(children[1]).toMatchObject({ url: '/demo%20ws/tasks?task=t1', title: 'Fix login', children: [{ value: 'WEB-12' }] });
    expect(children[2].value).toBe(', not API-3, and ');
  });

  it('skips code, existing links and images', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        { type: 'inlineCode', value: 'WEB-12' },
        { type: 'code', value: 'WEB-12' },
        { type: 'paragraph', children: [{ type: 'link', url: 'https://x.test', children: [{ type: 'text', value: 'WEB-12' }] }] },
      ],
    };
    const before = JSON.stringify(tree);
    linkTaskKeys(tree, links);
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe('links', () => {
  it('tells external from in-app addresses', () => {
    expect(isExternalHref('https://example.com')).toBe(true);
    expect(isExternalHref('//evil.test/x')).toBe(true);
    expect(isExternalHref('/demo/tasks')).toBe(false);
    expect(isInternalHref('/demo/tasks')).toBe(true);
    expect(isInternalHref('//evil.test')).toBe(false);
    expect(isInternalHref('#section')).toBe(false);
  });
});

describe('describeLastEdit', () => {
  const now = new Date('2030-01-01T12:00:00.000Z');
  const base = {
    createdBy: { _id: 'u1', name: 'Ada' }, updatedBy: { _id: 'u2', name: 'Bob' },
    createdAt: '2030-01-01T11:00:00.000Z', updatedAt: '2030-01-01T11:55:00.000Z',
  };
  it('names who last changed the page and when', () => {
    expect(describeLastEdit({ ...base, version: 3 }, now)).toBe('Edited by Bob 5 minutes ago');
    expect(describeLastEdit({ ...base, version: 1 }, now)).toBe('Created by Ada 1 hour ago');
  });
});
