"use client";

import { createContext, useContext } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const SourceContext = createContext<{
	href: string;
	domain: string;
} | null>(null);

function useSourceContext() {
	const ctx = useContext(SourceContext);
	if (!ctx) throw new Error("Source.* must be used inside <Source>");
	return ctx;
}

export type SourceProps = {
	href: string;
	children: React.ReactNode;
};

export function Source({ href, children }: SourceProps) {
	let domain = "";
	try {
		domain = new URL(href).hostname;
	} catch {
		domain = href.split("/").pop() || href;
	}

	return (
		<SourceContext.Provider value={{ href, domain }}>
			<HoverCard openDelay={150} closeDelay={0}>
				{children}
			</HoverCard>
		</SourceContext.Provider>
	);
}

export type SourceTriggerProps = {
	label?: string | number;
	showFavicon?: boolean;
	className?: string;
};

export function SourceTrigger({
	label,
	showFavicon = false,
	className,
}: SourceTriggerProps) {
	const { href, domain } = useSourceContext();
	const labelToShow = label ?? domain.replace("www.", "");

	return (
		<HoverCardTrigger asChild>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={cn(
					"inline-flex h-6 max-w-40 items-center gap-1 overflow-hidden rounded-full border border-border bg-secondary text-secondary-foreground no-underline transition-colors duration-150 hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
					showFavicon ? "pr-2.5 pl-1" : "px-2.5",
					className,
				)}
			>
				{showFavicon && (
					<img
						src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
							href,
						)}`}
						alt="favicon"
						width={14}
						height={14}
						className="size-3.5 rounded-full"
					/>
				)}
				<span className="truncate text-center text-xs font-medium">
					{labelToShow}
				</span>
			</a>
		</HoverCardTrigger>
	);
}

export type SourceContentProps = {
	title: string;
	description: string;
	className?: string;
};

export function SourceContent({
	title,
	description,
	className,
}: SourceContentProps) {
	const { href, domain } = useSourceContext();

	return (
		<HoverCardContent className={cn("w-80 p-0 shadow-xs", className)}>
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="flex flex-col gap-2 p-3"
			>
				<div className="flex items-center gap-1.5">
					<img
						src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(
							href,
						)}`}
						alt="favicon"
						className="size-4 rounded-full"
						width={16}
						height={16}
					/>
					<div className="text-foreground truncate text-sm">
						{domain.replace("www.", "")}
					</div>
				</div>
				<div className="line-clamp-2 text-sm font-medium">{title}</div>
				<div className="text-muted-foreground line-clamp-2 text-sm">
					{description}
				</div>
			</a>
		</HoverCardContent>
	);
}
