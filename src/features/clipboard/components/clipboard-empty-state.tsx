export function ClipboardEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-background/60 px-5 py-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
