"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "noledge-theme";

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "system";
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored;
	}
	return "system";
}

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(resolved: ResolvedTheme): void {
	const root = document.documentElement;
	root.classList.toggle("dark", resolved === "dark");
}

type UseThemeResult = {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
};

export function useTheme(): UseThemeResult {
	const [theme, setThemeState] = useState<Theme>("system");
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

	useEffect(() => {
		const stored = getStoredTheme();
		setThemeState(stored);
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");

		const resolve = (): void => {
			const next: ResolvedTheme = theme === "system" ? getSystemTheme() : theme;
			setResolvedTheme(next);
			applyTheme(next);
		};

		resolve();

		if (theme === "system") {
			media.addEventListener("change", resolve);
			return () => media.removeEventListener("change", resolve);
		}

		return undefined;
	}, [theme]);

	const setTheme = useCallback((next: Theme): void => {
		window.localStorage.setItem(STORAGE_KEY, next);
		setThemeState(next);
	}, []);

	return { theme, resolvedTheme, setTheme };
}
