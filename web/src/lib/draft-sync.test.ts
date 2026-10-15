import { describe, expect, it } from 'vitest';

import { syncDrafts } from './draft-sync';

describe('draft-sync — 表单草稿与 store 值的按值同步（T09）', () => {
  it('用户输入中间态：draft 与 store 解析值一致时保留（小数不断输）', () => {
    // 用户在 a 框输入 "4."：store.a 已被同步为 4，draft 必须保留。
    const drafts = { a: '4.' };
    const result = syncDrafts(drafts, { a: 4 });
    expect(result).toBeNull(); // 无变更 → 同一引用，React 跳过 setState
  });

  it('外部加载：store 值在 draft 之下被替换，旧 draft 被丢弃', () => {
    // 用户留下 draft "99" 后上传了新晶体（a=4.0339）：draft 必须作废。
    const drafts = { a: '99' };
    const result = syncDrafts(drafts, { a: 4.0339 });
    expect(result).toEqual({});
  });

  it('空 draft 等价于 0（与组件 parseNumberField 口径一致）', () => {
    expect(syncDrafts({ x: '' }, { x: 0 })).toBeNull();
    expect(syncDrafts({ x: '' }, { x: 5 })).toEqual({});
  });

  it('非有限解析（NaN 中间态）保守丢弃，避免显示幻觉', () => {
    expect(syncDrafts({ x: '-' }, { x: 1 })).toEqual({});
    expect(syncDrafts({ x: 'abc' }, { x: 1 })).toEqual({});
  });

  it('文本字段按字符串相等比较', () => {
    expect(syncDrafts({ name: 'Al' }, { name: 'Al' })).toBeNull();
    expect(syncDrafts({ name: 'Al' }, { name: 'Cu' })).toEqual({});
  });

  it('多字段混合：只清理不一致的字段', () => {
    const drafts = { a: '4.', b: '99', name: 'Al' };
    const result = syncDrafts(drafts, { a: 4, b: 6, name: 'Al' });
    expect(result).toEqual({ a: '4.', name: 'Al' });
  });

  it('空 drafts 无变更', () => {
    expect(syncDrafts({}, { a: 1 })).toBeNull();
  });

  it('store 缺少对应字段（undefined）时丢弃 draft', () => {
    expect(syncDrafts({ ghost: '1' }, {})).toEqual({});
  });
});
