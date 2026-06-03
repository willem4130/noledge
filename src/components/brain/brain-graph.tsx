"use client";

import { forceCollide } from "d3-force-3d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, {
	type ForceGraphMethods,
	type NodeObject,
} from "react-force-graph-3d";
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type {
	BrainGraph as BrainGraphData,
	BrainLink,
	BrainNode,
} from "@/lib/ai/brain/graph";

const BG_DARK = "#151718";
const BG_LIGHT = "#ffffff";

// Tracks the active theme by observing the `.dark` class the theme system
// toggles on <html>. Decoupled from useTheme(), whose state is per-instance and
// would not see changes made by other components (e.g. the settings dialog).
function useIsDark(): boolean {
	const [isDark, setIsDark] = useState(false);
	useEffect(() => {
		const root = document.documentElement;
		const sync = (): void => setIsDark(root.classList.contains("dark"));
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);
	return isDark;
}

type GraphNode = NodeObject<BrainNode>;
type GraphLink = BrainLink;

/** Live simulation coordinates force-graph mutates onto each node object. */
type NodeCoords = { x?: number; y?: number; z?: number };

type ClusterLabel = {
	documentId: string;
	title: string;
	color: string;
	x: number;
	y: number;
	visible: boolean;
};

// Highlight/dim anchors per theme. Dark mode flares toward near-white on a dark
// canvas; light mode flares toward near-black so nodes stay legible on white.
const NODE_HOT_DARK = "#f0fdff";
const NODE_HOT_LIGHT = "#0f172a";
const NODE_DIM_DARK = "#1e3a44";
const NODE_DIM_LIGHT = "#cbd5e1";
const LINK_HOT_DARK = "#67e8f9";
const LINK_HOT_LIGHT = "#0e7490";
const LINK_DIM_DARK = "#0c2a33";
const LINK_DIM_LIGHT = "#e2e8f0";

// Neon palette — each source document gets its own colour so clusters read.
const DOC_PALETTE = [
	"#22d3ee", // cyan
	"#34d399", // emerald
	"#a78bfa", // violet
	"#f472b6", // pink
	"#fbbf24", // amber
	"#60a5fa", // blue
	"#f87171", // red
	"#4ade80", // green
] as const;

/** Stable colour per document id, cycling through the neon palette. */
function documentColorMap(nodes: BrainNode[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const node of nodes) {
		if (map.has(node.documentId)) continue;
		const color = DOC_PALETTE[map.size % DOC_PALETTE.length] ?? "#22d3ee";
		map.set(node.documentId, color);
	}
	return map;
}

/** Escape text before it is placed into the tooltip's innerHTML. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Parse `#rrggbb` into an [r, g, b] triplet (0–255). */
function parseHex(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	const at = (start: number): number =>
		Number.parseInt(value.slice(start, start + 2), 16) || 0;
	return [at(0), at(2), at(4)];
}

/** Linearly interpolate between two hex colours. `t` is clamped to [0, 1]. */
function lerpColor(from: string, to: string, t: number): string {
	const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
	const a = parseHex(from);
	const b = parseHex(to);
	const channel = (i: 0 | 1 | 2): string =>
		Math.round(a[i] + (b[i] - a[i]) * clamped)
			.toString(16)
			.padStart(2, "0");
	return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** At runtime force-graph replaces a link endpoint with the node object. */
function endpointId(endpoint: BrainLink["source"]): string {
	if (typeof endpoint === "object" && endpoint !== null) {
		return String((endpoint as { id: string }).id);
	}
	return String(endpoint);
}

/**
 * Collect the nodes and links directly adjacent to a node, for hover focus.
 */
function neighborsOf(
	node: GraphNode,
	links: GraphLink[],
): { nodes: Set<string>; links: Set<GraphLink> } {
	const nodeIds = new Set<string>([String(node.id)]);
	const linkSet = new Set<GraphLink>();
	const nodeId = String(node.id);
	for (const link of links) {
		const source = endpointId(link.source);
		const target = endpointId(link.target);
		if (source === nodeId || target === nodeId) {
			linkSet.add(link);
			nodeIds.add(source);
			nodeIds.add(target);
		}
	}
	return { nodes: nodeIds, links: linkSet };
}

export function BrainGraph({
	graph,
}: {
	graph: BrainGraphData;
}): React.JSX.Element {
	const isDark = useIsDark();
	const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>(undefined);
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [hovered, setHovered] = useState<GraphNode | null>(null);

	// Per-element animated highlight intensity (0 = resting, 1 = fully lit).
	// Eased every frame toward a target so hover transitions glide in/out.
	const nodeIntensity = useRef(new Map<string, number>());
	const linkIntensity = useRef(new Map<GraphLink, number>());
	const focusRef = useRef<ReturnType<typeof neighborsOf> | null>(null);
	const hoveredIdRef = useRef<string | null>(null);

	// react-force-graph mutates link.source/target into node objects, so clone.
	const data = useMemo(
		() => ({
			nodes: graph.nodes.map((node) => ({ ...node })),
			links: graph.links.map((link) => ({ ...link })),
		}),
		[graph],
	);

	// onNodeHover fires on every pointer move over a node and intermittently
	// reports null between frames, which made the highlight flicker. Ignore events
	// that do not actually change the hovered node.
	const handleNodeHover = useCallback((node: GraphNode | null): void => {
		const nextId = node ? String(node.id) : null;
		setHovered((prev) => {
			const prevId = prev ? String(prev.id) : null;
			return nextId === prevId ? prev : node;
		});
	}, []);

	const focus = useMemo(
		() => (hovered ? neighborsOf(hovered, data.links) : null),
		[hovered, data.links],
	);

	// Mirror hover state into refs so the per-frame animation loop can read the
	// current target without being recreated on every hover. `hoveredIdRef` is
	// kept sticky on unhover so the flared node's white eases back to base via its
	// own fading intensity instead of snapping in a single frame.
	focusRef.current = focus;
	if (hovered) hoveredIdRef.current = String(hovered.id);

	const docColors = useMemo(() => documentColorMap(data.nodes), [data.nodes]);

	// One cluster per source document: its title plus the node ids that compose it,
	// so a single label can be parked at the cluster's centroid.
	const clusters = useMemo(() => {
		const byDoc = new Map<
			string,
			{ documentId: string; title: string; nodeIds: string[] }
		>();
		for (const node of data.nodes) {
			const existing = byDoc.get(node.documentId);
			if (existing) {
				existing.nodeIds.push(String(node.id));
			} else {
				byDoc.set(node.documentId, {
					documentId: node.documentId,
					title: node.documentTitle,
					nodeIds: [String(node.id)],
				});
			}
		}
		return [...byDoc.values()];
	}, [data.nodes]);

	// Screen-space position + visibility for each cluster label, refreshed every
	// frame from the projected centroid of the cluster's nodes.
	const [labels, setLabels] = useState<ClusterLabel[]>([]);

	// Track container size so the canvas fills available space responsively.
	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setSize({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Bloom pass — recreated when the canvas resizes so its resolution matches.
	useEffect(() => {
		const fg = fgRef.current;
		if (!fg || size.width === 0) return;
		// Additive bloom only reads well on a dark canvas; on white it washes the
		// whole scene out, so it is disabled in light mode.
		if (!isDark) {
			fg.refresh();
			return;
		}
		const bloom = new UnrealBloomPass(
			new THREE.Vector2(size.width, size.height),
			0.5, // strength — kept low so the background stays dark, not washed out
			0.6, // radius
			0.6, // threshold — only the brightest (active) nodes flare
		);
		const composer = fg.postProcessingComposer();
		composer.addPass(bloom);
		fg.refresh();
		return () => {
			composer.removePass(bloom);
			bloom.dispose();
		};
	}, [size.width, size.height, isDark]);

	// One-time layout setup: forces, controls, and initial framing. Kept out of
	// the resize effect so collapsing the sidebar never reheats/re-scatters the
	// graph — it runs once, after the instance is ready and the size is known.
	const layoutReady = useRef(false);
	useEffect(() => {
		const fg = fgRef.current;
		if (!fg || size.width === 0 || layoutReady.current) return;
		layoutReady.current = true;

		// Deterministic spacing so the layout always opens into a constellation
		// rather than occasionally settling into a tight ball. Defaults (charge
		// -30-ish, link distance 30) are too weak for a densely linked graph.
		const charge = fg.d3Force("charge") as
			| { strength: (n: number) => void; distanceMax: (n: number) => void }
			| undefined;
		if (charge) {
			charge.strength(-220); // stronger mutual repulsion → more spread
			charge.distanceMax(600); // cap range so distant clusters stay put
		}
		const linkForce = fg.d3Force("link") as
			| { distance: (fn: () => number) => void }
			| undefined;
		if (linkForce) {
			linkForce.distance(() => 55); // explicit rest length between linked nodes
		}
		// Collision force: nodes physically cannot overlap, which is the robust
		// guard against the layout packing into a tight cluster regardless of seed.
		fg.d3Force("collision", forceCollide(14));
		// Re-settle once with the new forces so spacing is consistent every load.
		fg.d3ReheatSimulation();

		// Faster, snappier zoom — the trackball default (1.2) feels sluggish.
		const controls = fg.controls() as { zoomSpeed?: number };
		controls.zoomSpeed = 3.2;
		// Frame the whole constellation once it has settled (matches the common
		// force-graph pattern of zoomToFit on load).
		const fitTimer = setTimeout(() => fg.zoomToFit(700, 60), 1200);
		return () => clearTimeout(fitTimer);
	}, [size.width]);

	// Animation loop: ease each node/link intensity toward its focus target and
	// repaint, so hover highlight and fade-out glide instead of snapping.
	useEffect(() => {
		const fg = fgRef.current;
		if (!fg || size.width === 0) return;
		let frame = 0;
		const EASE = 0.18; // per-frame approach rate (~120ms settle at 60fps)
		const tick = (): void => {
			const currentFocus = focusRef.current;
			const nodeMap = nodeIntensity.current;
			const linkMap = linkIntensity.current;
			let changed = false;

			for (const node of data.nodes) {
				const id = String(node.id);
				const target = !currentFocus ? 0 : currentFocus.nodes.has(id) ? 1 : -1; // negative target = dim below resting
				const prev = nodeMap.get(id) ?? 0;
				const next = prev + (target - prev) * EASE;
				if (Math.abs(next - prev) > 0.001) changed = true;
				nodeMap.set(id, next);
			}

			for (const link of data.links) {
				const target = currentFocus?.links.has(link) ? 1 : 0;
				const prev = linkMap.get(link) ?? 0;
				const next = prev + (target - prev) * EASE;
				if (Math.abs(next - prev) > 0.001) changed = true;
				linkMap.set(link, next);
			}

			if (changed) fg.refresh();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [data, size.width]);

	// Project each cluster centroid to screen space every frame so the labels
	// track the constellation as it settles, rotates, or zooms.
	useEffect(() => {
		const fg = fgRef.current;
		if (!fg || size.width === 0 || clusters.length === 0) return;
		// force-graph mutates live x/y/z onto these node objects at runtime, which
		// the cloned BrainNode type does not express; read them through a coord view.
		const nodeById = new Map<string, NodeCoords>(
			data.nodes.map((node) => [String(node.id), node as NodeCoords]),
		);
		let frame = 0;
		let prev: ClusterLabel[] = [];
		// Skip the React update unless a label actually moved or toggled, so the
		// overlay stops re-rendering once the simulation settles.
		const changedEnough = (a: ClusterLabel[], b: ClusterLabel[]): boolean => {
			if (a.length !== b.length) return true;
			for (let i = 0; i < a.length; i += 1) {
				const x = a[i];
				const y = b[i];
				if (!x || !y) return true;
				if (x.documentId !== y.documentId || x.visible !== y.visible)
					return true;
				if (Math.abs(x.x - y.x) > 0.5 || Math.abs(x.y - y.y) > 0.5) return true;
			}
			return false;
		};
		const tick = (): void => {
			const next: ClusterLabel[] = [];
			for (const cluster of clusters) {
				let sx = 0;
				let sy = 0;
				let count = 0;
				for (const id of cluster.nodeIds) {
					const node = nodeById.get(id);
					if (!node || node.x == null || node.y == null) continue;
					const screen = fg.graph2ScreenCoords(node.x, node.y, node.z ?? 0);
					sx += screen.x;
					sy += screen.y;
					count += 1;
				}
				if (count === 0) continue;
				const x = sx / count;
				const y = sy / count;
				next.push({
					documentId: cluster.documentId,
					title: cluster.title,
					color: docColors.get(cluster.documentId) ?? "#22d3ee",
					x,
					y,
					visible: x >= 0 && y >= 0 && x <= size.width && y <= size.height,
				});
			}
			if (changedEnough(next, prev)) {
				prev = next;
				setLabels(next);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [clusters, data.nodes, docColors, size.width, size.height]);

	const nodeColor = useCallback(
		(node: GraphNode): string => {
			const palette = docColors.get(node.documentId) ?? "#22d3ee";
			// On white the neon palette is too light; darken it for contrast.
			const base = isDark ? palette : lerpColor(palette, "#0f172a", 0.45);
			const hot = isDark ? NODE_HOT_DARK : NODE_HOT_LIGHT;
			const dim = isDark ? NODE_DIM_DARK : NODE_DIM_LIGHT;
			const intensity = nodeIntensity.current.get(String(node.id)) ?? 0;
			if (intensity >= 0) {
				// 0 → resting colour, 1 → bright flare on the focused node.
				const isHovered = String(node.id) === hoveredIdRef.current;
				return lerpColor(base, isHovered ? hot : base, intensity);
			}
			// Negative intensity fades toward the dim colour for unrelated nodes.
			return lerpColor(base, dim, -intensity);
		},
		[docColors, isDark],
	);

	const linkColor = useCallback(
		(link: GraphLink): string => {
			const restingDark = link.kind === "sequence" ? "#155e75" : "#0e7490";
			const restingLight = link.kind === "sequence" ? "#94a3b8" : "#64748b";
			const resting = isDark ? restingDark : restingLight;
			const hot = isDark ? LINK_HOT_DARK : LINK_HOT_LIGHT;
			const dim = isDark ? LINK_DIM_DARK : LINK_DIM_LIGHT;
			const intensity = linkIntensity.current.get(link) ?? 0;
			if (intensity <= 0.001) return focusRef.current ? dim : resting;
			return lerpColor(focusRef.current ? dim : resting, hot, intensity);
		},
		[isDark],
	);

	const linkWidth = useCallback((link: GraphLink): number => {
		const intensity = linkIntensity.current.get(link) ?? 0;
		return 0.4 + intensity * 0.8;
	}, []);

	const particles = useCallback(
		(link: GraphLink): number =>
			(linkIntensity.current.get(link) ?? 0) > 0.5 ? 4 : 0,
		[],
	);

	return (
		<div ref={containerRef} className="relative size-full">
			<ForceGraph3D<GraphNode, GraphLink>
				ref={fgRef}
				width={size.width || undefined}
				height={size.height || undefined}
				graphData={data}
				backgroundColor={isDark ? BG_DARK : BG_LIGHT}
				nodeId="id"
				nodeLabel={(node) =>
					`<div style="max-width:260px"><strong>${escapeHtml(node.documentTitle)}</strong> · #${node.ordinal}<br/>${escapeHtml(node.preview)}</div>`
				}
				nodeColor={nodeColor}
				nodeVal={1.5}
				nodeRelSize={4}
				nodeOpacity={0.95}
				nodeResolution={16}
				linkColor={linkColor}
				linkWidth={linkWidth}
				linkOpacity={0.5}
				linkDirectionalParticles={particles}
				linkDirectionalParticleWidth={1.8}
				linkDirectionalParticleSpeed={0.006}
				linkDirectionalParticleColor={() =>
					isDark ? LINK_HOT_DARK : LINK_HOT_LIGHT
				}
				onNodeHover={handleNodeHover}
				onNodeClick={(node) => {
					const fg = fgRef.current;
					if (!fg || node.x == null || node.y == null || node.z == null) return;
					const distance = 120;
					const ratio = 1 + distance / Math.hypot(node.x, node.y, node.z || 1);
					fg.cameraPosition(
						{ x: node.x * ratio, y: node.y * ratio, z: (node.z || 1) * ratio },
						{ x: node.x, y: node.y, z: node.z },
						1200,
					);
				}}
				enableNodeDrag={false}
				showNavInfo={false}
			/>
			{labels.map((label) =>
				label.visible ? (
					<span
						key={label.documentId}
						className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
						style={{
							left: label.x,
							top: label.y,
							color: isDark
								? label.color
								: lerpColor(label.color, "#0f172a", 0.5),
							backgroundColor: isDark
								? "rgba(21, 23, 24, 0.6)"
								: "rgba(255, 255, 255, 0.7)",
						}}
					>
						{label.title}
					</span>
				) : null,
			)}
		</div>
	);
}
