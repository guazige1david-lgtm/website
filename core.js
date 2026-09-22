/* ============================================================
   Web 终端模拟器
   - 真实键盘输入、命令解析、历史记录
   - 内置虚拟文件系统，支持文件/目录操作
   ============================================================ */

(function () {
  'use strict';

  // ---------- 虚拟文件系统 ----------
  // 目录: { type: 'dir', children: {...} }
  // 文件: { type: 'file', content: '...' }
  const root = {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          user: {
            type: 'dir',
            children: {
              'readme.txt': {
                type: 'file',
                content: '欢迎使用我的 Web 终端模拟器！\n输入 help 查看可用命令。'
              },
              projects: { type: 'dir', children: {} }
            }
          }
        }
      },
      etc: {
        type: 'dir',
        children: {
          hostname: { type: 'file', content: 'web-terminal' }
        }
      }
    }
  };

  let cwd = '/home/user';           // 当前工作目录
  const history = [];               // 命令历史
  let historyIndex = -1;            // 历史浏览指针

  // ---------- DOM ----------
  const $body = document.getElementById('terminal-body');
  const $output = document.getElementById('terminal-output');
  const $prompt = document.getElementById('prompt');
  const $typed = document.getElementById('typed-text');
  const $cursor = document.getElementById('cursor');
  const $title = document.getElementById('terminal-title');

  // ---------- 工具函数 ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const scrollBottom = () => { $body.scrollTop = $body.scrollHeight; };

  /** 输出一行文本（允许前面带行内节点） */
  function println(text, cls) {
    const line = el('div', 'line ' + (cls || ''));
    if (text !== undefined && text !== null) line.textContent = text;
    $output.appendChild(line);
    scrollBottom();
    return line;
  }

  /** 输出多行纯文本 */
  function printLines(text, cls) {
    String(text).split('\n').forEach(l => println(l, cls));
  }

  /** 规范化路径：把相对路径解析为绝对路径 */
  function resolvePath(input, base) {
    base = base || cwd;
    let path = input;
    if (!path || path[0] !== '/') {
      path = (base === '/' ? '' : base) + '/' + path;
    }
    const parts = path.split('/');
    const stack = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') stack.pop();
      else stack.push(p);
    }
    return '/' + stack.join('/');
  }

  /** 按绝对路径取节点，找不到返回 null */
  function getNode(absPath) {
    if (absPath === '/') return root;
    const parts = absPath.split('/').filter(Boolean);
    let node = root;
    for (const p of parts) {
      if (!node || node.type !== 'dir' || !node.children[p]) return null;
      node = node.children[p];
    }
    return node;
  }

  /** 返回父目录节点和最后一段名字 */
  function getParent(absPath) {
    const parts = absPath.split('/').filter(Boolean);
    const name = parts.pop();
    const parentPath = '/' + parts.join('/');
    return { parent: getNode(parentPath), name, parentPath };
  }

  /** 美化显示路径：家目录显示为 ~ */
  function displayPath(p) {
    if (p === '/home/user') return '~';
    if (p.startsWith('/home/user/')) return '~' + p.slice('/home/user'.length);
    return p;
  }

  // ---------- 提示符 ----------
  function renderPrompt() {
    $prompt.innerHTML = '';
    const user = el('span', '', 'user@web-terminal');
    const colon = el('span', '', ':');
    const path = el('span', 'path', displayPath(cwd));
    const dollar = el('span', '', '$ ');
    $prompt.append(user, colon, path, dollar);
    $title.textContent = 'bash — ' + displayPath(cwd);
  }

  // ---------- 输入状态 ----------
  let current = '';   // 当前输入内容

  function renderInput() {
    $typed.textContent = current;
    scrollBottom();
  }

  // ---------- 命令实现 ----------
  const commands = {
    help() {
      printLines(
        '可用命令：\n' +
        '  help              显示帮助\n' +
        '  ls [路径]         列出目录内容\n' +
        '  cd [路径]         切换目录\n' +
        '  pwd               显示当前路径\n' +
        '  cat <文件>        查看文件内容\n' +
        '  echo <文本>       输出文本\n' +
        '  tree              以树形显示目录\n' +
        '  date              显示当前时间\n' +
	'  whoami            显示我的信息\n' +
        '  clear             清屏\n' +
        '  neofetch          显示系统信息'
      );
    },

    ls(args) {
      const target = args[0] ? resolvePath(args[0]) : cwd;
      const node = getNode(target);
      if (!node) return println(`ls: ${args[0]}: 没有那个文件或目录`, 'cmd-err');
      if (node.type === 'file') return println(args[0]);
      const names = Object.keys(node.children);
      if (names.length === 0) return;   // 空目录不输出
      // 目录加 /，按列对齐
      const items = names.map(n => ({
        name: n + (node.children[n].type === 'dir' ? '/' : ''),
        dir: node.children[n].type === 'dir'
      }));
      const line = el('div', 'line');
      items.forEach((it, i) => {
        const span = el('span', it.dir ? 'cmd-dir' : '', it.name);
        line.appendChild(span);
        if (i < items.length - 1) line.appendChild(document.createTextNode('   '));
      });
      $output.appendChild(line);
      scrollBottom();
    },

    cd(args) {
      const target = args[0] ? resolvePath(args[0]) : '/home/user';
      const node = getNode(target);
      if (!node) return println(`cd: ${args[0]}: 没有那个文件或目录`, 'cmd-err');
      if (node.type !== 'dir') return println(`cd: ${args[0]}: 不是目录`, 'cmd-err');
      cwd = target;
      renderPrompt();
    },

    pwd() { println(cwd); },

    cat(args) {
      if (!args[0]) return println('cat: 缺少文件名', 'cmd-err');
      const node = getNode(resolvePath(args[0]));
      if (!node) return println(`cat: ${args[0]}: 没有那个文件或目录`, 'cmd-err');
      if (node.type === 'dir') return println(`cat: ${args[0]}: 是一个目录`, 'cmd-err');
      printLines(node.content);
    },

    echo(args) { println(args.join(' ')); },

    tree() {
      const walk = (node, prefix) => {
        const names = Object.keys(node.children);
        names.forEach((n, i) => {
          const last = i === names.length - 1;
          const child = node.children[n];
          const isDir = child.type === 'dir';
          println(prefix + (last ? '└── ' : '├── ') + n + (isDir ? '/' : ''),
            isDir ? 'cmd-dir' : '');
          if (isDir) {
            walk(child, prefix + (last ? '    ' : '│   '));
          }
        });
      };
      println(displayPath(cwd), 'cmd-dim');
      walk(getNode(cwd), '');
    },

    date() { println(new Date().toString()); },

    whoami() { println('我是瓜子哥，一位普通的CS学生。lgtm: let guazige tell madly'); },

    history() {
      history.forEach((h, i) => println(String(i + 1).padStart(4, ' ') + '  ' + h));
    },

    clear() { $output.innerHTML = ''; },

    neofetch() {
      println('        user@web-terminal');
      println('        -----------------');
      println('  OS:     Web Terminal Simulator');
      println('  Shell:  js-sh 1.0');
      println('  Uptime: ' + Math.floor(performance.now() / 1000) + 's');
      println('  CWD:    ' + displayPath(cwd));
    }
  };

  // ---------- 执行一行命令 ----------
  function runCommand(raw) {
    const line = raw.trim();
    if (!line) return;
    history.push(line);
    historyIndex = history.length;

    const [cmd, ...args] = line.split(/\s+/);
    const fn = commands[cmd];
    if (fn) {
      try { fn(args); }
      catch (e) { println('执行出错: ' + e.message, 'cmd-err'); }
    } else {
      println(`${cmd}: 未找到命令。输入 help 查看可用命令。`, 'cmd-err');
    }
  }

  // ---------- 键盘事件 ----------
  function onKeyDown(e) {
    const key = e.key;

    if (key === 'Enter') {
      e.preventDefault();
      // 把当前这行"固化"到输出区
      const line = el('div', 'line');
      line.appendChild($prompt.cloneNode(true));
      line.appendChild(document.createTextNode(current));
      $output.appendChild(line);
      println('');
      const cmd = current;
      current = '';
      renderInput();
      runCommand(cmd);
      renderPrompt();
      return;
    }

    if (key === 'Backspace') {
      e.preventDefault();
      current = current.slice(0, -1);
      renderInput();
      return;
    }

    if (key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        current = history[historyIndex];
        renderInput();
      }
      return;
    }

    if (key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        current = history[historyIndex];
      } else {
        historyIndex = history.length;
        current = '';
      }
      renderInput();
      return;
    }

    if (key === 'Tab') {
      e.preventDefault();
      // 简单补全：命令名与当前目录下的条目
      const parts = current.split(/\s+/);
      const last = parts[parts.length - 1] || '';
      let candidates = [];
      if (parts.length === 1) {
        candidates = Object.keys(commands).filter(c => c.startsWith(last));
      } else {
        const node = getNode(cwd);
        if (node && node.type === 'dir') {
          candidates = Object.keys(node.children).filter(n => n.startsWith(last));
        }
      }
      if (candidates.length === 1) {
        parts[parts.length - 1] = candidates[0];
        current = parts.join(' ');
        renderInput();
      } else if (candidates.length > 1) {
        println(candidates.join('   '), 'cmd-dim');
      }
      return;
    }

    if (key === 'l' && e.ctrlKey) {
      e.preventDefault();
      $output.innerHTML = '';
      return;
    }

    if (key === 'c' && e.ctrlKey) {
      e.preventDefault();
      const line = el('div', 'line');
      line.appendChild($prompt.cloneNode(true));
      line.appendChild(document.createTextNode(current + '^C'));
      $output.appendChild(line);
      current = '';
      historyIndex = history.length;
      renderInput();
      scrollBottom();
      return;
    }

    // 普通可打印字符
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      current += key;
      renderInput();
    }
  }

  // 点击终端任意位置聚焦（让键盘事件生效）
  document.addEventListener('keydown', (e) => {
    // 只在终端区域内或没有其他输入框时处理
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    onKeyDown(e);
  });

  // 光标在页面失焦时隐藏
  window.addEventListener('blur', () => $cursor.classList.add('hidden'));
  window.addEventListener('focus', () => $cursor.classList.remove('hidden'));

  // ---------- 启动 ----------
  function boot() {
    renderPrompt();
    printLines(
      'Web Terminal Simulator v1.0\n' +
      '输入 help 查看可用命令，Tab 补全，↑/↓ 浏览历史。',
      'cmd-dim'
    );
    println('');
  }

  boot();
})();
