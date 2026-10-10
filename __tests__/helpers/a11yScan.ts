/**
 * A small VoiceOver regression guard (#146). Walks a rendered host tree
 * (RNTL's toJSON()) and lists what VoiceOver would get wrong:
 *
 * - a pressable (anything with onClick: every Touchable and Pressable)
 *   without an accessibility role, or without a name (a label or text);
 * - a switch without a label;
 * - a tab, radio or checkbox without its selected/checked state;
 * - an image or SF Symbol that is neither labeled, hidden, nor inside an
 *   element VoiceOver reads as one (an `accessible` ancestor).
 *
 * Off-the-shelf scanners don't fit this stack (see #146), so this checks
 * the props the app actually sets. Usage:
 *   expect(a11yViolations(toJSON())).toEqual([]);
 */

interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

type Rendered = HostNode | HostNode[] | null;

const IMAGE_TYPES = new Set(['Image', 'SymbolView', 'ExpoImage']);
const SELECTABLE_ROLES: Record<string, 'selected' | 'checked'> = { tab: 'selected', radio: 'checked', checkbox: 'checked' };

function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  if (isHidden(node)) return '';
  return (node.children ?? []).map(textOf).join('');
}

function isHidden(node: HostNode): boolean {
  const p = node.props;
  // importantForAccessibility is Android-only: it hides nothing from
  // VoiceOver, so it doesn't count here.
  return p.accessibilityElementsHidden === true || p['aria-hidden'] === true;
}

function nameOf(node: HostNode): string {
  const label = node.props.accessibilityLabel ?? node.props['aria-label'];
  if (typeof label === 'string' && label.trim()) return label.trim();
  return textOf(node).trim();
}

function describe(node: HostNode): string {
  const id = node.props.testID;
  const name = nameOf(node);
  return `${node.type}${id ? `#${String(id)}` : ''}${name ? ` "${name.slice(0, 40)}"` : ''}`;
}

export function a11yViolations(tree: Rendered): string[] {
  const out: string[] = [];
  const walk = (node: HostNode | string, grouped: boolean) => {
    if (typeof node === 'string') return;
    if (isHidden(node)) return;
    const p = node.props;
    const role = (p.accessibilityRole ?? p.role) as string | undefined;

    if (typeof p.onClick === 'function') {
      if (!role) out.push(`${describe(node)}: pressable without a role`);
      if (!nameOf(node)) out.push(`${describe(node)}: pressable without a name`);
    }
    if (node.type === 'RCTSwitch' && !p.accessibilityLabel) {
      out.push(`${describe(node)}: switch without a label`);
    }
    if (role && role in SELECTABLE_ROLES) {
      const key = SELECTABLE_ROLES[role];
      const state = (p.accessibilityState ?? {}) as Record<string, unknown>;
      if (typeof state[key] !== 'boolean') out.push(`${describe(node)}: ${role} without accessibilityState.${key}`);
    }
    if (IMAGE_TYPES.has(node.type) && !grouped && !p.accessibilityLabel && p.accessible !== false) {
      out.push(`${describe(node)}: image without a label or hidden flag`);
    }
    const groups = grouped || p.accessible === true;
    for (const child of node.children ?? []) walk(child, groups);
  };
  for (const root of Array.isArray(tree) ? tree : tree ? [tree] : []) walk(root, false);
  return out;
}
