import { BookOpen } from "lucide-react";

export default function KnowledgePage(): React.JSX.Element {
	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 px-4 py-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
				<p className="text-sm text-muted-foreground">
					Browse what you have taught noledge.
				</p>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border p-12 text-center">
				<BookOpen className="size-8 text-muted-foreground" />
				<p className="text-sm font-medium">No knowledge yet</p>
				<p className="text-xs text-muted-foreground">
					Upload documents to populate your knowledge base.
				</p>
			</div>
		</div>
	);
}
