import FileExplorer from "@/components/FileExplorer";
import { ModeToggle } from "@/components/mode-toggle";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listFiles, getAbsPath } from "@/lib/files";
import LogoutButton from "@/components/LogoutButton";
import db from "@/lib/db";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import { NextResponse } from "next/server";

export default async function ExplorerPage(props: { params: Promise<{ path?: string[] }>, searchParams: Promise<{ download?: string; password?: string }> }) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const isDownload = searchParams.download === '1';
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
    
    // Check if user is admin
    let isAdmin = false;
    if (session) {
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(session.id) as { is_admin: number } | undefined;
        isAdmin = user?.is_admin === 1;
    }

    let initialFileData: any = { files: [] };
    let error: string | null = null;
    let errorType: "unauthorized" | "no_permissions" | "other" = "other";

    try {
        initialFileData = await listFiles(pathSegments, session, password);
    } catch (e: any) {
        if (e.message === "Unauthorized") {
            // Not logged in - redirect to login
            if (!session) {
                redirect("/login");
            } else {
                error = "Unauthorized";
                errorType = "unauthorized";
            }
        } else if (e.message === "No permissions") {
            // Logged in but no permissions
            error = "You don't have permission to access this folder.";
            errorType = "no_permissions";
        } else {
            error = e.message;
            errorType = "other";
        }
    }

    return (
        <div className="flex h-screen flex-col bg-background">
            <header className="flex h-16 items-center justify-between border-b px-6 bg-card">
                <div className="flex items-center gap-2">
                    <Link href="/files/public">
                        <h1 className="text-xl font-bold hover:text-primary transition-colors cursor-pointer">File Server</h1>
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
            <main className="flex-1 overflow-hidden p-6">
                <FileExplorer
                    initialPath={pathSegments.join('/')}
                    initialFiles={error ? [] : initialFileData.files}
                    isLoggedIn={!!session}
                    error={error}
                    errorType={errorType}
                />
            </main>
        </div>
    );
}
