import { render, type VNode } from 'preact'
import { act } from 'preact/test-utils'

let mountedRoots: HTMLElement[] = []

export async function mount(vnode: VNode): Promise<HTMLElement> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  await act(() => { render(vnode, root) })
  mountedRoots.push(root)
  return root
}

export async function rerender(vnode: VNode, root: HTMLElement): Promise<void> {
  await act(() => { render(vnode, root) })
}

export async function cleanupMounted(): Promise<void> {
  for (const root of mountedRoots) {
    await act(() => { render(null, root) })
    root.remove()
  }
  mountedRoots = []
}
