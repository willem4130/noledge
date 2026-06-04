"use client";

import { CaretDown } from "@phosphor-icons/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** `null` = scheduling off; `0..23` = run at that local hour. */
export type HourValue = number | null;

type HourSelectProps = {
	value: HourValue;
	onChange: (value: HourValue) => void;
	disabled?: boolean;
};

function labelFor(value: HourValue): string {
	if (value === null) return "Off";
	return `${String(value).padStart(2, "0")}:00`;
}

const HOURS: HourValue[] = [null, ...Array.from({ length: 24 }, (_, i) => i)];

export function HourSelect({
	value,
	onChange,
	disabled,
}: HourSelectProps): React.JSX.Element {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				className={cn(
					"inline-flex h-9 w-24 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
					"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					"disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
				)}
			>
				{labelFor(value)}
				<CaretDown className="size-4 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-72 w-24 min-w-24 overflow-y-auto"
			>
				{HOURS.map((hour) => (
					<button
						key={hour === null ? "off" : hour}
						type="button"
						onClick={() => onChange(hour)}
						className={cn(
							"flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
							value === hour && "bg-accent text-accent-foreground",
						)}
					>
						{labelFor(hour)}
					</button>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
