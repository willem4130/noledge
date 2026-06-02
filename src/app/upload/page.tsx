import { Upload } from "lucide-react";

export default function UploadPage(): React.JSX.Element {
	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 px-4 py-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
				<p className="text-sm text-muted-foreground">
					Add documents to your knowledge base.
				</p>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
				<Upload className="size-8 text-muted-foreground" />
				<p className="text-sm font-medium">Drag and drop files here</p>
				<p className="text-xs text-muted-foreground">
					or click to browse — placeholder, no backend wired yet.
				</p>
			</div>
		</div>
	);
}
