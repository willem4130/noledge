import { BookOpen, type LucideIcon, MessageSquare, Upload } from "lucide-react";

export type NavItem = {
	readonly title: string;
	readonly href: string;
	readonly icon: LucideIcon;
};

export type ChatSession = {
	readonly id: string;
	readonly title: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
	{ title: "Chat", href: "/", icon: MessageSquare },
	{ title: "Upload", href: "/upload", icon: Upload },
	{ title: "Knowledge", href: "/knowledge", icon: BookOpen },
];

export const CHAT_SESSIONS: readonly ChatSession[] = [
	{ id: "s1", title: "Onboarding checklist draft" },
	{ id: "s2", title: "Summarize quarterly report" },
	{ id: "s3", title: "Refactor auth middleware" },
	{ id: "s4", title: "Marketing copy ideas" },
	{ id: "s5", title: "Debug streaming response" },
	{ id: "s6", title: "Database schema review" },
	{ id: "s7", title: "Weekend trip itinerary" },
];
