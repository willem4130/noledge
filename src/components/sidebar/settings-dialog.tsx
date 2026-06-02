"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { type Theme, useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type SettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

export function SettingsDialog({
	open,
	onOpenChange,
}: SettingsDialogProps): React.JSX.Element {
	const { theme, setTheme } = useTheme();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Manage your preferences and account.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2 rounded-lg border p-3">
						<div className="space-y-0.5">
							<p className="text-sm font-medium">Appearance</p>
							<p className="text-xs text-muted-foreground">
								Choose how noledge looks to you.
							</p>
						</div>
						<div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
							{THEME_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => setTheme(option.value)}
									aria-pressed={theme === option.value}
									className={cn(
										"flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
										theme === option.value
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<option.icon className="size-4" />
									{option.label}
								</button>
							))}
						</div>
					</div>
					<div className="flex items-center justify-between rounded-lg border p-3">
						<div className="space-y-0.5">
							<p className="text-sm font-medium">Account</p>
							<p className="text-xs text-muted-foreground">you@example.com</p>
						</div>
						<Button variant="outline" size="sm" type="button">
							Sign out
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
