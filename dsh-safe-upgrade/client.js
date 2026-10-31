window.__ModuleLoader__.load({
  id: 'dsh-safe-upgrade',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const API = new URL('safe-upgrade/api/', document.baseURI).pathname.replace(/\/$/, '')
    const T = {
      bg: 'var(--dsw-alias-bg-document-preview, #151517)',
      label: 'var(--dsw-alias-label-primary, #f9fafb)',
      secondary: 'var(--dsw-alias-label-secondary, #cfd3d6)',
      caption: 'var(--dsw-alias-label-caption, #81858c)',
      stroke: 'var(--dsw-alias-border-inverted, rgba(255,255,255,0.06))',
      success: 'var(--dsw-alias-state-success-primary, #22c55e)',
      error: 'var(--dsw-alias-state-error-primary, #f25a5a)',
      primaryFill: 'var(--dsw-alias-button-primary-fill, #f9fafb)',
      primaryInk: 'var(--dsw-alias-label-primary-foreground, #0f1115)',
      ghostFill: 'var(--dsw-alias-button-floating-hover, #353638)',
      radius: 'var(--dsw-radius-md, 12px)',
      elevation: 'var(--dsw-elevation-prominent, 0 0 0 .5px #fff3, 0 8px 24px #00000040)',
      successTint: 'color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 16%, transparent)',
    }

    const portal = (() => {
      try {
        const reactDom = require('react-dom')
        return typeof reactDom?.createPortal === 'function' ? reactDom.createPortal : null
      } catch {
        return null
      }
    })()

    function ensureStyle() {
      const id = 'dsh-safe-upgrade-style'
      if (document.getElementById(id) !== null) return
      const style = document.createElement('style')
      style.id = id
      style.textContent = [
        '@keyframes dsh-safe-upgrade-spin{to{transform:rotate(360deg)}}',
        '@keyframes dsh-safe-upgrade-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}',
        '.dsh-safe-upgrade-entry{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;height:42px;padding:0 10px 0 8px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary,#f9fafb);font:inherit;font-size:14px;line-height:22px;cursor:pointer;transition:background .15s ease}',
        '.dsh-safe-upgrade-entry:hover{background:var(--dsw-alias-button-ghost-active-fill,rgba(255,255,255,.06))}',
        '.dsh-safe-upgrade-entry svg{flex:0 0 auto}',
        '.dsh-safe-upgrade-ghost{border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-caption,#81858c);font:inherit;font-size:13px;padding:6px 10px;cursor:pointer;transition:background .15s ease,color .15s ease}',
        '.dsh-safe-upgrade-ghost:hover{background:var(--dsw-alias-button-ghost-active-fill,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#f9fafb)}',
        '.dsh-safe-upgrade-primary{border:0;border-radius:8px;background:var(--dsw-alias-button-primary-fill,#f9fafb);color:var(--dsw-alias-label-primary-foreground,#0f1115);font:inherit;font-size:13px;font-weight:600;padding:7px 16px;cursor:pointer;transition:opacity .15s ease}',
        '.dsh-safe-upgrade-primary:hover{opacity:.88}',
      ].join('\n')
      document.head.appendChild(style)
    }

    function Check() {
      return h('svg', { width: 11, height: 11, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', { d: 'M2.4 6.3 4.9 8.7 9.6 3.6', fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function Cross() {
      return h('svg', { width: 11, height: 11, viewBox: '0 0 12 12', 'aria-hidden': true },
        h('path', { d: 'M3.2 3.2 8.8 8.8 M8.8 3.2 3.2 8.8', fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round' }))
    }

    function Shield({ size = 16, highlighted = false }) {
      const style = highlighted
        ? { color: T.success, filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.45))' }
        : undefined
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true, style },
        h('path', {
          d: 'M8 1.8 13.4 4v4.1c0 3-2.2 5.4-5.4 6-3.2-.6-5.4-3-5.4-6V4L8 1.8Z',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M5.7 8 7.3 9.6 10.4 6.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function Dot({ state }) {
      const base = {
        width: 20, height: 20, borderRadius: '50%', flex: '0 0 auto', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${T.stroke}`, boxSizing: 'border-box', fontSize: 11, color: T.caption,
      }
      if (state === 'done') return h('span', { style: { ...base, background: T.success, borderColor: T.success } }, h(Check))
      if (state === 'failed') return h('span', { style: { ...base, background: T.error, borderColor: T.error } }, h(Cross))
      if (state === 'running') return h('span', { style: { ...base, borderColor: T.success, borderTopColor: 'transparent', animation: 'dsh-safe-upgrade-spin .8s linear infinite' } })
      return h('span', { style: base })
    }

    function Step({ index, label, state, detail }) {
      const lines = detail === undefined || detail === null || detail === '' ? [] : String(detail).split('\n')
      return h('div', { style: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0' } },
        h(Dot, { state }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: '1 1 auto' } },
          h('span', {
            style: { fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: state === 'idle' ? T.caption : T.label, transition: 'color .2s ease' },
          }, `${index}. ${label}`),
          lines.map((line, at) => h('span', {
            key: at,
            style: { fontSize: 12, color: T.secondary, opacity: 0.82, lineHeight: 1.65, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
          }, line))))
    }

    function head(plan) {
      const from = plan.current?.version ?? '未知版本'
      return `${from} → ${plan.target.version}`
    }

    function summarize(plan) {
      if (plan.upToDate === true) return `已是最新版本（${plan.current?.version ?? '未知'}），无需更新。`
      const total = plan.plugins.filter((plugin) => plugin.installed).length
      const bad = plan.incompatible.length
      return bad === 0
        ? `${head(plan)}；检查了 ${total} 个已启用插件，全部兼容。`
        : `${head(plan)}；检查了 ${total} 个已启用插件，${bad} 个不适配新版本：`
    }

    function reasons(plan) {
      const byName = new Map(plan.plugins.map((plugin) => [plugin.name, plugin]))
      return plan.incompatible.map((name) => {
        const plugin = byName.get(name)
        const unmet = plugin === undefined ? [] : Object.entries(plugin.unmet)
        return `${name}@${plugin?.version ?? '?'} 要求 ${unmet.map(([peer, range]) => `${peer} ${range}`).join('，') || '（要求已无法解析）'}`
      }).join('\n')
    }

    function SafeUpgrade({ wide = true }) {
      const [open, setOpen] = useState(false)
      const [steps, setSteps] = useState([])
      const [available, setAvailable] = useState(null)

      /** The entry only exists while the feed carries a version newer than this build. */
      useEffect(() => {
        ensureStyle()
        let live = true
        fetch(`${API}/status`, { cache: 'no-store' })
          .then((response) => response.json())
          .then((body) => {
            if (live) setAvailable(body.available === true)
          })
          .catch(() => {
            if (live) setAvailable(true)
          })
        return () => { live = false }
      }, [])

      const patch = useCallback((key, next) => {
        setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...next } : step)))
      }, [])

      const run = useCallback(async () => {
        setSteps([
          { key: 'check', label: '检查插件适配性', state: 'running', detail: '正在读取官方更新源与已启用插件…' },
          { key: 'disable', label: '关闭不适配插件', state: 'idle' },
          { key: 'update', label: '更新 Harness 中', state: 'idle' },
        ])

        let plan = null
        try {
          const response = await fetch(`${API}/plan`, { cache: 'no-store' })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
          plan = body
          patch('check', {
            state: 'done',
            detail: plan.incompatible.length === 0 ? summarize(plan) : `${summarize(plan)}\n${reasons(plan)}`,
          })
        } catch (error) {
          patch('check', { state: 'failed', detail: error instanceof Error ? error.message : String(error) })
          return
        }

        if (plan.upToDate === true) {
          setAvailable(false)
          patch('disable', { state: 'done', detail: '无需处理。' })
          patch('update', { state: 'done', detail: '当前已是最新版本。' })
          return
        }

        if (plan.incompatible.length === 0) {
          patch('disable', { state: 'done', detail: '没有需要关闭的插件。' })
        } else {
          patch('disable', { state: 'running', detail: `正在关闭 ${plan.incompatible.join('、')}…` })
          try {
            const response = await fetch(`${API}/disable`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ names: plan.incompatible }),
            })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
            const disabled = Array.isArray(body.disabled) ? body.disabled : []
            const failed = Array.isArray(body.failed) ? body.failed : []
            const pending = disabled.filter((entry) => entry.application === 'restart-required').map((entry) => entry.name)
            if (failed.length === 0) {
              const suffix = pending.length === 0 ? '' : `（${pending.join('、')} 在本次更新重启后生效）`
              patch('disable', { state: 'done', detail: `已关闭 ${disabled.length} 个插件${suffix}。更新后可在插件面板重新开启。` })
            } else {
              patch('disable', { state: 'failed', detail: failed.map((entry) => `${entry.name}: ${entry.error}`).join('\n') })
            }
          } catch (error) {
            patch('disable', { state: 'failed', detail: error instanceof Error ? error.message : String(error) })
          }
        }

        const native = window.dshDesktop?.updates?.open
        if (typeof native !== 'function') {
          patch('update', { state: 'idle', detail: '当前窗口没有桌面端更新入口，请在桌面端点击侧栏的“新版本”按钮完成更新。' })
          return
        }
        patch('update', { state: 'running', detail: '正在唤起桌面端更新…' })
        try {
          await native()
          patch('update', { state: 'done', detail: '已交给桌面端更新流程，请按弹出的对话框继续；装完需要重启，本页会随应用一起重开。' })
        } catch (error) {
          patch('update', { state: 'failed', detail: error instanceof Error ? error.message : String(error) })
        }
      }, [patch])

      useEffect(() => {
        if (!open) return undefined
        ensureStyle()
        void run()
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open, run])

      const running = steps.some((step) => step.state === 'running')

      if (!open && available !== true) return null

      const button = h('button', {
        type: 'button',
        className: 'dsh-safe-upgrade-entry',
        title: '安全升级：先检查插件适配性，再更新 Harness',
        onClick: () => setOpen(true),
      },
        h(Shield, { size: 16, highlighted: true }),
        wide ? h('span', null, '安全升级') : null)

      if (!open) return button

      const dialog = h('div', {
        role: 'presentation',
        onClick: (event) => {
          if (event.target === event.currentTarget) setOpen(false)
        },
        style: {
          position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(6, 8, 14, 0.62)', backdropFilter: 'blur(6px)',
        },
      },
        h('div', {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': '安全升级',
          style: {
            width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflow: 'auto',
            borderRadius: 'var(--dsw-radius-lg, 16px)', border: `1px solid ${T.stroke}`,
            background: T.bg, color: T.label, boxShadow: T.elevation,
            padding: '20px 24px 14px', animation: 'dsh-safe-upgrade-in .18s ease-out',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12 } },
            h('span', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34,
                borderRadius: 10, background: T.successTint, color: T.success, flex: '0 0 auto',
              },
            }, h(Shield, { size: 18 })),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', minWidth: 0, paddingTop: 1 } },
              h('strong', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '.01em' } }, '安全升级'),
              h('span', { style: { fontSize: 12, color: T.caption } }, '先检查插件适配性，再更新 Harness')),
            h('button', { type: 'button', className: 'dsh-safe-upgrade-ghost', onClick: () => setOpen(false), style: { marginTop: -3, marginRight: -8 } }, '关闭')),
          h('div', { style: { borderTop: `1px solid ${T.stroke}`, margin: '16px -24px 0' } }),
          h('div', { 'aria-live': 'polite' },
            steps.map((step, index) => h(Step, {
              key: step.key,
              index: index + 1,
              label: step.label,
              state: step.state,
              detail: step.detail,
            }))),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${T.stroke}`, margin: '2px -24px 0', padding: '12px 24px 0', gap: 10 } },
            h('button', {
              type: 'button', className: 'dsh-safe-upgrade-ghost',
              disabled: running,
              onClick: () => void run(),
              style: { marginLeft: -10, opacity: running ? 0.45 : 1, cursor: running ? 'default' : 'pointer' },
            }, '重新检查'),
            h('button', { type: 'button', className: 'dsh-safe-upgrade-primary', onClick: () => setOpen(false) }, '完成'))))

      return h(React.Fragment, null, button, portal === null ? dialog : portal(dialog, document.body))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'safe-upgrade',
          order: 10,
        }, SafeUpgrade))
      },
    }
  },
})
