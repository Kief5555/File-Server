import FileExplorer from "@/components/FileExplorer";
import { ModeToggle } from "@/components/mode-toggle";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listFiles, type FileItem } from "@/lib/files";
import LogoutButton from "@/components/LogoutButton";
import db from "@/lib/db";

export default async function ExplorerPage(props: { params: Promise<{ path?: string[] }>, searchParams: Promise<{ password?: string }> }) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const password = searchParams.password || null;

    // Handle different entry points (/files/public, /files/private, /, etc)
    let pathSegments = params.path || [];

    // If the path starts with 'files', remove it as it's just for routing
    if (pathSegments.length > 0 && pathSegments[0] === 'files') {
        pathSegments = pathSegments.slice(1);
    }

    // Default to 'public' if no path remains
    if (pathSegments.length === 0) {
        pathSegments = ['public'];
    }

    const session = await getSession();
    
    let isAdmin = false;
    let canUpload = false;
    let canDelete = false;
    if (session) {
        const user = db.prepare('SELECT can_upload, can_delete, is_admin FROM users WHERE id = ?').get(session.id) as { can_upload: number; can_delete: number; is_admin: number } | undefined;
        isAdmin = user?.is_admin === 1;
        canUpload = isAdmin || user?.can_upload === 1;
        canDelete = isAdmin || user?.can_delete === 1;
    }

    let initialFileData: { files: FileItem[] } = { files: [] };
    let error: string | null = null;
    let errorType: "unauthorized" | "no_permissions" | "other" = "other";

    try {
        initialFileData = await listFiles(pathSegments, session, password);
    } catch (errorValue: unknown) {
        const message = errorValue instanceof Error ? errorValue.message : "Error";
        if (message === "Unauthorized") {
            // Not logged in - redirect to login
            if (!session) {
                redirect("/login");
            } else {
                error = "Unauthorized";
                errorType = "unauthorized";
            }
        } else if (message === "No permissions") {
            // Logged in but no permissions
            error = "You don't have permission to access this folder.";
            errorType = "no_permissions";
        } else {
            error = message;
            errorType = "other";
        }
    }

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-12 sm:h-16 items-center justify-between border-b px-3 sm:px-6 bg-card">
                <div className="flex items-center gap-2 min-w-0">
                    <Link href="/files/public">
                        <h1 className="text-base sm:text-xl font-bold hover:text-primary transition-colors cursor-pointer truncate">File Server</h1>
                    </Link>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <ModeToggle />
                    {session ? (
                        <>
                            <span className="text-sm text-muted-foreground hidden sm:inline-block">Welcome, {session.username}</span>
                            {isAdmin && (
                                <Link href="/admin">
                                    <Button variant="outline" size="sm" className="hidden sm:flex">
                                        Settings
                                    </Button>
                                </Link>
                            )}
                            <LogoutButton />
                        </>
                    ) : (
                        <Link href="/login">
                            <Button size="sm">Login</Button>
                        </Link>
                    )}
                </div>
            </header>
            <main className="flex-1 min-h-0 overflow-auto p-3 sm:p-6">
                <FileExplorer
                    key={pathSegments.join('/')}
                    initialPath={pathSegments.join('/')}
                    initialFiles={error ? [] : initialFileData.files}
                    isLoggedIn={!!session}
                    canUpload={canUpload}
                    canDelete={canDelete}
                    error={error}
                    errorType={errorType}
                />
            </main>
        </div>
    );
}
