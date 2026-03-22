export default function CampaignRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-foreground">Campaign Not Found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This campaign link is inactive or doesn't exist. Please check the URL and try again.
      </p>
    </div>
  );
}
