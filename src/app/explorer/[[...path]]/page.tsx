import FileExplorer from "@/components/FileExplorer";
import { ModeToggle } from "@/components/mode-toggle";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { listFiles, type FileItem } from "@/lib/files";
import LogoutButton from "@/components/LogoutButton";
import db from "@/lib/db";
import { Settings2, UserRound, ArrowUpRight } from "lucide-react";

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
        <div className="file-app-shell">
            <header className="file-app-header">
                <Link href="/files/public" className="file-brand">
                    <Image className="file-brand-mark" src="/icon.ico" width={42} height={42} alt="PrintedWaste" unoptimized />
                    <span><span className="file-brand-name">File Server<span className="brand-dot">.</span></span><span className="file-brand-byline">PRINTEDWASTE</span></span>
                </Link>
                <div className="file-account-actions">
                    <ModeToggle />
                    {session ? <>
                        <span className="file-account-name"><UserRound aria-hidden="true" />{session.username}</span>
                        {isAdmin && <Button asChild variant="ghost" className="settings-link"><Link href="/admin" aria-label="Settings"><Settings2 /><span>Settings</span></Link></Button>}
                        <LogoutButton />
                    </> : <Button asChild variant="outline" className="sign-in-button"><Link href="/login">Sign in<ArrowUpRight /></Link></Button>}
                </div>
            </header>
            <main className="file-app-content">
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
