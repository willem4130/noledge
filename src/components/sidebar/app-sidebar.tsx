"use client";

import { Moon, SquarePen, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { CHAT_SESSIONS, NAV_ITEMS } from "./nav-data";
import { SettingsDialog } from "./settings-dialog";

export function AppSidebar(): React.JSX.Element {
	const pathname = usePathname();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center justify-between gap-2">
					<span className="px-1 text-base font-semibold group-data-[collapsible=icon]:hidden">
						noledge
					</span>
					<SidebarTrigger />
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{NAV_ITEMS.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={pathname === item.href}
										tooltip={item.title}
									>
										<Link href={item.href}>
											<item.icon />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarGroup className="group-data-[collapsible=icon]:hidden">
					<SidebarGroupLabel>Chats</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{CHAT_SESSIONS.map((session) => (
								<SidebarMenuItem key={session.id}>
									<SidebarMenuButton>
										<SquarePen />
										<span>{session.title}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip={
								resolvedTheme === "dark"
									? "Switch to light mode"
									: "Switch to dark mode"
							}
							onClick={() =>
								setTheme(resolvedTheme === "dark" ? "light" : "dark")
							}
						>
							{resolvedTheme === "dark" ? <Sun /> : <Moon />}
							<span>
								{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							tooltip="Settings"
							onClick={() => setSettingsOpen(true)}
						>
							<Avatar className="size-7">
								<AvatarFallback>U</AvatarFallback>
							</Avatar>
							<div className="flex flex-col text-left leading-tight">
								<span className="text-sm font-medium">User</span>
								<span className="text-xs text-muted-foreground">
									you@example.com
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
		</Sidebar>
	);
}
