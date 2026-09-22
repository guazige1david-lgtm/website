/* ============================================================
   把 fs-data.js 里的“扁平路径表”展开成运行时目录树。

   展开后的节点结构与改造前完全一致：
   - 目录：{ type: 'dir', children: {...} }
   - 文件：{ type: 'file', content: '...' }

   ls / cd / cat / tree / Tab 补全只认这个结构，
   所以它们不需要知道数据是从哪来的。
   ============================================================ */

(function (global) {
  'use strict';

  /** 把数据条目里的内容统一转成字符串（数组每一项占一行） */
  function toContent(value) {
    if (Array.isArray(value)) return value.join('\n');
    if (value === null || value === undefined) return '';
    return String(value);
  }

  /** 取出文件内容：既支持裸字符串/数组，也支持 { type:'file', content:... } */
  function contentOf(value) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && value.type === 'file') {
      return toContent(value.content);
    }
    return toContent(value);
  }

  /** 判断条目表示的是不是目录 */
  function isDirEntry(value) {
    if (value === null || value === undefined) return true;          // '/a/b': null
    if (typeof value !== 'object' || Array.isArray(value)) return false; // 字符串 / 数组 => 文件
    if (value.type === 'dir') return true;
    if (value.type === 'file') return false;
    if (Object.keys(value).length === 0) return true;                // {} => 空目录
    throw new Error('无法识别的条目（需要 type: "dir" 或 type: "file"）: ' + JSON.stringify(value));
  }

  /** 规范化路径：必须以 / 开头，合并 //、. 与 .. */
  function normalizePath(input) {
    if (typeof input !== 'string' || input.charAt(0) !== '/') {
      throw new Error('虚拟文件系统路径必须以 / 开头: ' + String(input));
    }
    const stack = [];
    input.split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { stack.pop(); return; }
      stack.push(part);
    });
    return '/' + stack.join('/');
  }

  /** 沿路径逐级创建（或复用）目录，返回最深的那一层 */
  function ensureDir(root, parts) {
    let node = root;
    for (const part of parts) {
      let next = node.children[part];
      if (!next) {
        next = node.children[part] = { type: 'dir', children: {} };
      }
      if (next.type !== 'dir') {
        throw new Error('路径冲突：' + part + ' 已经是文件，不能当作目录');
      }
      node = next;
    }
    return node;
  }

  /**
   * 展开扁平路径表。data 的写法：
   *   '/home/user/readme.txt': ['第一行', '第二行']  // 文件，数组每一项一行
   *   '/etc/hostname':         'web-terminal'       // 文件，单行字符串
   *   '/home/user/projects':   null                 // 空目录（必须显式写出）
   *   '/var/log':              { type: 'dir' }      // 目录
   *   '/a/b.txt':              { type: 'file', content: '...' }
   *
   * 中间缺失的父目录会自动创建；条目按声明顺序生成，
   * 所以 ls 的显示顺序就是 fs-data.js 里的书写顺序。
   */
  function buildTree(data) {
    const root = { type: 'dir', children: {} };
    if (!data || typeof data !== 'object') return root;

    Object.keys(data).forEach(function (rawPath) {
      const absPath = normalizePath(rawPath);
      if (absPath === '/') {
        throw new Error('根目录不需要也不能在数据里声明: ' + rawPath);
      }

      const parts = absPath.split('/').filter(Boolean);
      const name = parts.pop();
      const parent = ensureDir(root, parts);
      const existing = parent.children[name];
      const value = data[rawPath];

      if (isDirEntry(value)) {
        if (existing && existing.type !== 'dir') {
          throw new Error('路径冲突：' + absPath + ' 已经被声明为文件');
        }
        ensureDir(parent, [name]);
        return;
      }

      if (existing) {
        throw new Error('路径冲突：' + absPath + ' 重复声明或已被声明为目录');
      }
      parent.children[name] = { type: 'file', content: contentOf(value) };
    });

    return root;
  }

  global.VFS = {
    buildTree: buildTree,
    normalizePath: normalizePath
  };
})(window);
