"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import { Folder, File, FileText, Image as ImageIcon, Film, MoreVertical, Trash, Edit, Upload, Grid, List as ListIcon, Loader2, Download, Share2, Lock, ArrowUp, Search, Eye, EyeOff, Filter, Music, Play, Pause, RefreshCw, X, ChevronLeft, ChevronRight, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { FileItem } from "@/lib/directory";
import { uploadFile } from "@/lib/uploads";

// Stable component identity keeps links mounted during preview and progress updates.
function FileLink({ directory, href, children, className }: {
    directory: boolean; href: string; children: React.ReactNode; className?: string;
}) {
    return directory ? <Link href={href} prefetch={false} className={className}>{children}</Link>
        : <a href={href} className={className}>{children}</a>;
}

interface FileExplorerProps {
    initialPath?: string;
    initialFiles?: FileItem[];
    isLoggedIn?: boolean;
    canUpload?: boolean;
    canDelete?: boolean;
    error?: string | null;
    errorType?: "unauthorized" | "no_permissions" | "other";
}

const formatFileSize = (bytes: number | null) => {
    if (bytes === null) return "Folder";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatTime = (time: number) => {
    if (!time || !isFinite(time) || isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const fileNameCollator = new Intl.Collator(undefined, { numeric: true });

const PREVIEW_MAX_SIZE_BYTES = 200 * 1024 * 1024; 
const PREVIEW_HOVER_DELAY_MS = 450; // Delay before showing preview to avoid loading on quick hovers
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT_ESTIMATE = 360;
const PREVIEW_MARGIN = 16;

const supportsDesktopHover = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
};

const encodePathSegments = (filePath: string) =>
    filePath
        .split("/")
        .filter(Boolean)
        .map(encodeURIComponent)
        .join("/");

const getPreviewUrl = (currentPath: string, fileName: string) => {
    const encodedPath = encodePathSegments(currentPath);
    return `/api/files/${encodedPath}/${encodeURIComponent(fileName)}`;
};

const getFilesUrl = (currentPath: string, fileName?: string) => {
    const encodedPath = encodePathSegments(fileName ? `${currentPath}/${fileName}` : currentPath);
    return `/files/${encodedPath}`;
};

const getApiFilesUrl = (filePath: string) => `/api/files/${encodePathSegments(filePath)}`;

const VideoPreview = ({ src }: { src: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
    const seekingRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [displayTime, setDisplayTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [is2x, setIs2x] = useState(false);
    const [isHolding, setIsHolding] = useState(false);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current || seekingRef.current) return;
        setDisplayTime(videoRef.current.currentTime);
    };

    const handleSeeked = () => {
        if (videoRef.current) {
            setDisplayTime(videoRef.current.currentTime);
        }
        seekingRef.current = false;
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        if (!videoRef.current || !progressRef.current) return;
        
        const videoDuration = videoRef.current.duration;
        if (!videoDuration || !isFinite(videoDuration)) return;
        
        seekingRef.current = true;
        const rect = progressRef.current.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = percentage * videoDuration;
        
        // Update display immediately for responsiveness
        setDisplayTime(newTime);
        setDuration(videoDuration);
        
        // Seek the video
        videoRef.current.currentTime = newTime;
    };

    // Hold for 2 seconds to activate 2x speed
    const handleOverlayMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsHolding(true);
        
        holdTimerRef.current = setTimeout(() => {
            if (!videoRef.current) return;
            videoRef.current.playbackRate = 2;
            setIs2x(true);
            if (videoRef.current.paused) {
                videoRef.current.play();
                setIsPlaying(true);
            }
        }, 2000);
    };

    const handleOverlayMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsHolding(false);
        
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        
        if (is2x) {
            if (videoRef.current) {
                videoRef.current.playbackRate = 1;
            }
            setIs2x(false);
        } else {
            togglePlay();
        }
    };

    const handleOverlayMouseLeave = () => {
        setIsHolding(false);
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (is2x && videoRef.current) {
            videoRef.current.playbackRate = 1;
            setIs2x(false);
        }
    };

    const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

    return (
        <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden" data-media-controls>
            <video
                ref={videoRef}
                src={src}
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onSeeked={handleSeeked}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />
            {/* Play/Pause overlay - doesn't cover progress bar */}
            <div
                className="absolute inset-0 bottom-3 flex items-center justify-center cursor-pointer"
                onMouseDown={handleOverlayMouseDown}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseLeave}
            >
                {!isPlaying && !isHolding && (
                    <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 text-black ml-0.5" fill="currentColor" />
                    </div>
                )}
                {isPlaying && !isHolding && (
                    <div className="w-12 h-12 bg-transparent hover:bg-white/90 rounded-full flex items-center justify-center transition-colors group">
                        <Pause className="w-6 h-6 text-transparent group-hover:text-black" fill="currentColor" />
                    </div>
                )}
            </div>
            {/* Time display + 2x indicator */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 pointer-events-none">
                {is2x && (
                    <span className="px-1.5 py-0.5 bg-primary text-primary-foreground rounded text-[9px] font-bold">
                        2x
                    </span>
                )}
                {isHolding && !is2x && (
                    <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[9px]">
                        Hold...
                    </span>
                )}
                <span className="px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white font-mono">
                    {formatTime(displayTime)} / {formatTime(duration)}
                </span>
            </div>
            {/* Progress bar - clickable, separate from overlay */}
            <div
                ref={progressRef}
                className="absolute bottom-0 left-0 w-full h-2 bg-black/50 cursor-pointer z-10"
                onClick={handleProgressClick}
            >
                <div
                    className="h-full bg-primary"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

const AudioPreview = ({ src }: { src: string }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isReady, setIsReady] = useState(false);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!audioRef.current || !isReady) return;
        if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
        } else {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    };

    const handleTimeUpdate = () => {
        if (!audioRef.current) return;
        setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration) && isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
            setIsReady(true);
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        if (!audioRef.current || !isReady || !duration || !progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioRef.current.currentTime = percentage * duration;
        setCurrentTime(percentage * duration);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="p-4 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-md" data-media-controls>
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />
            <div className="flex items-center gap-3">
                <button
                    onClick={togglePlay}
                    className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                    disabled={!isReady}
                >
                    {isPlaying ? (
                        <Pause className="w-4 h-4" fill="currentColor" />
                    ) : (
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    )}
                </button>
                <div className="flex-1">
                    <div
                        ref={progressRef}
                        className="w-full h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                        onMouseDown={handleSeek}
                    >
                        <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{isReady ? formatTime(duration) : "--:--"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ImagePreview = ({ src }: { src: string }) => {
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(true);

    if (error) {
        return (
            <div className="w-full h-32 bg-muted flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span>Image corrupted</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-[80px]">
            {loading && (
                <div className="absolute inset-0 bg-muted flex items-center justify-center min-h-[80px]">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}
            <img
                src={src}
                alt="preview"
                className="w-full h-auto object-contain max-h-48"
                loading="lazy"
                decoding="async"
                onLoad={() => setLoading(false)}
                onError={() => { setError(true); setLoading(false); }}
            />
        </div>
    );
};

const TextPreview = ({ src }: { src: string }) => {
    const [preview, setPreview] = useState<{ src: string; content: string | null; loading: boolean }>({
        src,
        content: null,
        loading: true,
    });

    const isCurrentPreview = preview.src === src;
    const content = isCurrentPreview ? preview.content : null;
    const loading = isCurrentPreview ? preview.loading : true;

    useEffect(() => {
        const ac = new AbortController();
        fetch(src, { signal: ac.signal, headers: { Range: "bytes=0-8191" } })
            .then(async res => {
                if (!res.ok) throw new Error("Preview unavailable");
                // Bound reads even if a proxy ignores Range.
                const reader = res.body?.getReader();
                if (!reader) return "";
                const decoder = new TextDecoder();
                let text = "";
                try {
                    while (text.length < 2000) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        text += decoder.decode(value, { stream: true });
                    }
                    return text.slice(0, 2000);
                } finally { await reader.cancel(); }
            })
            .then(text => {
                setPreview({ src, content: text.slice(0, 2000), loading: false });
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    setPreview({ src, content: "Failed to load preview", loading: false });
                }
            });
        return () => ac.abort();
    }, [src]);

    if (loading) {
        return (
            <div className="text-[10px] leading-tight text-muted-foreground p-3 bg-muted font-mono h-32 flex items-center justify-center">
                Loading...
            </div>
        );
    }

    return (
        <div className="text-[10px] leading-tight text-muted-foreground p-3 bg-muted font-mono max-h-40 overflow-auto whitespace-pre-wrap break-all">
            {content}
        </div>
    );
};

export default function FileExplorer({
    initialPath = "public",
    initialFiles = [],
    isLoggedIn = false,
    canUpload = false,
    canDelete = false,
    error = null,
    errorType = "other",
}: FileExplorerProps) {
    const currentPath = initialPath;
    const [files, setFiles] = useState<FileItem[]>(initialFiles);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [sortMethod, setSortMethod] = useState<"name" | "date" | "size">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<"all" | "images" | "videos" | "audio" | "documents" | "folders">("all");
    const [previewsEnabled, setPreviewsEnabled] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const deferredSearch = useDeferredValue(searchQuery);
    const normalizedQuery = deferredSearch.toLowerCase();
    const [page, setPage] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const uploadController = useRef<AbortController | null>(null);
    const refreshController = useRef<AbortController | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const pageSize = 100;
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        try {
            const saved = JSON.parse(localStorage.getItem("file-explorer-preferences") || "{}");
            // Hydrate browser-only preferences after the server render.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (["grid", "list"].includes(saved.view)) setViewMode(saved.view);
            if (["name", "date", "size"].includes(saved.sort)) setSortMethod(saved.sort);
            if (["asc", "desc"].includes(saved.order)) setSortOrder(saved.order);
            if (typeof saved.previews === "boolean") setPreviewsEnabled(saved.previews);
        } catch { /* Storage may be disabled. */ }
        return () => {
            mounted.current = false;
            refreshController.current?.abort();
            uploadController.current?.abort();
        };
    }, []);

    const savePreferences = (change: Record<string, unknown>) => {
        try {
            localStorage.setItem("file-explorer-preferences", JSON.stringify({
                view: viewMode, sort: sortMethod, order: sortOrder, previews: previewsEnabled, ...change,
            }));
        } catch { /* Storage may be disabled. */ }
    };

    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
            if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", shortcut);
        return () => window.removeEventListener("keydown", shortcut);
    }, []);
    
    const isAtRoot = currentPath === "public" || currentPath === "private";

    const [folderDialogOpen, setFolderDialogOpen] = useState(false);
    const [folderName, setFolderName] = useState("");
    const [creatingFolder, setCreatingFolder] = useState(false);

    const createFolder = async (event: React.FormEvent) => {
        event.preventDefault();
        if (creatingFolder) return;
        setCreatingFolder(true);
        try {
            const response = await fetch("/api/folders", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: currentPath, name: folderName.trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            setFolderDialogOpen(false);
            setFolderName("");
            toast.success("Folder created");
            void fetchFiles(currentPath);
        } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create folder"); }
        finally { setCreatingFolder(false); }
    };

    // Dialog States
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [fileToRename, setFileToRename] = useState<FileItem | null>(null);
    const [newFileName, setNewFileName] = useState("");

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null);

    // Share state
    const [shareDialogOpen, setShareDialogOpen] = useState(false);
    const [fileToShare, setFileToShare] = useState<FileItem | null>(null);
    const [sharePassword, setSharePassword] = useState("");
    const [shareLink, setShareLink] = useState("");
    const [shareId, setShareId] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [isLoadingShare, setIsLoadingShare] = useState(false);
    const [isRevoking, setIsRevoking] = useState(false);

    // Desktop-only hover preview.
    const [hoveredFile, setHoveredFile] = useState<FileItem | null>(null);
    const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
    const previewRef = useRef<HTMLDivElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const showPreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const closePreview = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (showPreviewTimeoutRef.current) {
            clearTimeout(showPreviewTimeoutRef.current);
            showPreviewTimeoutRef.current = null;
        }
        setHoveredFile(null);
    };

    const handleFileMouseEnter = (e: React.MouseEvent, file: FileItem, isPreviewable: boolean) => {
        if (!supportsDesktopHover()) return;
        if (showPreviewTimeoutRef.current) {
            clearTimeout(showPreviewTimeoutRef.current);
            showPreviewTimeoutRef.current = null;
        }
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (!isPreviewable) {
            setHoveredFile(null);
            return;
        }
        const x = Math.min(
            Math.max(e.clientX + 18, PREVIEW_MARGIN),
            window.innerWidth - PREVIEW_WIDTH - PREVIEW_MARGIN
        );
        const y = Math.min(
            Math.max(e.clientY + 18, PREVIEW_MARGIN),
            window.innerHeight - PREVIEW_HEIGHT_ESTIMATE - PREVIEW_MARGIN
        );
        setPreviewPos({ x, y });
        // Delay before showing preview so we don't load media on quick hovers
        showPreviewTimeoutRef.current = setTimeout(() => {
            showPreviewTimeoutRef.current = null;
            setHoveredFile(file);
        }, PREVIEW_HOVER_DELAY_MS);
    };

    const handleFileMouseLeave = () => {
        if (showPreviewTimeoutRef.current) {
            clearTimeout(showPreviewTimeoutRef.current);
            showPreviewTimeoutRef.current = null;
        }
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredFile(null);
        }, 200);
    };

    const handlePreviewMouseEnter = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
    };

    const handlePreviewMouseLeave = () => {
        closePreview();
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (previewRef.current && previewRef.current.contains(e.target as Node)) {
                return;
            }
            closePreview();
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (showPreviewTimeoutRef.current) clearTimeout(showPreviewTimeoutRef.current);
        };
    }, []);

    // Keep the current listing visible while refreshing and cancel obsolete requests.
    const fetchFiles = useCallback(async (path: string) => {
        refreshController.current?.abort();
        const controller = new AbortController();
        refreshController.current = controller;
        setLoading(true);
        try {
            const url = new URL(getApiFilesUrl(path), window.location.origin);
            const password = new URLSearchParams(window.location.search).get("password");
            if (password) url.searchParams.set("password", password);
            const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch files");
            const data = await res.json();
            if (!controller.signal.aborted) setFiles(data.files || []);
        } catch {
            if (!controller.signal.aborted) toast.error("Error loading files. Your current listing has been kept.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    // Filter and Sort Logic
    const filteredAndSortedFiles = useMemo(() => [...files]
        .filter(file => {
            // Search filter
            if (normalizedQuery && !file.name.toLowerCase().includes(normalizedQuery)) {
                return false;
            }
            // Type filter
            if (filterType === "all") return true;
            if (filterType === "folders") return file.isDirectory;
            if (filterType === "images") return file.mimetype.startsWith("image/");
            if (filterType === "videos") return file.mimetype.startsWith("video/") || file.name.toLowerCase().endsWith('.mov');
            if (filterType === "audio") return file.mimetype.startsWith("audio/");
            if (filterType === "documents") return file.mimetype.includes("text") || file.mimetype.includes("pdf") || file.mimetype.includes("document");
            return true;
        })
        .sort((a, b) => {
            // Folders first
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            
            let res = 0;
            if (sortMethod === "name") {
                res = fileNameCollator.compare(a.name, b.name);
            } else if (sortMethod === "size") {
                res = (a.size ?? -1) - (b.size ?? -1);
            } else if (sortMethod === "date") {
                res = a.modified.localeCompare(b.modified);
            }
            return sortOrder === "asc" ? res : -res;
        }), [files, normalizedQuery, filterType, sortMethod, sortOrder]);
    const pageCount = Math.max(1, Math.ceil(filteredAndSortedFiles.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const visibleFiles = filteredAndSortedFiles.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    const handleRootSwitch = (root: "public" | "private") => {
        if (root === "private" && !isLoggedIn) {
            toast.error("Login required for private files");
            return;
        }
        router.push(`/files/${root}`);
    };

    // Toggle previews with toast
    const handleTogglePreviews = () => {
        const newState = !previewsEnabled;
        setPreviewsEnabled(newState);
        savePreferences({ previews: newState });
        toast(newState ? "Previews enabled" : "Previews disabled", {
            icon: newState ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
        });
        if (!newState) {
            // Close any open preview when disabling
            setHoveredFile(null);
        }
    };

    const uploadFiles = async (selected: File[]) => {
        if (!canUpload || error || uploadController.current || selected.length === 0) return;
        const controller = new AbortController();
        uploadController.current = controller;
        setUploading(true);
        const toastId = toast.loading(`Uploading ${selected.length} file${selected.length === 1 ? "" : "s"}…`);
        let completed = 0;
        let failed = 0;
        try {
            for (const file of selected) {
                controller.signal.throwIfAborted();
                const started = Date.now();
                let lastUpdate = 0;
                try {
                    await uploadFile(file, currentPath, controller.signal, bytes => {
                        const now = Date.now();
                        if (now - lastUpdate < 150 && bytes !== file.size) return;
                        lastUpdate = now;
                        const speed = bytes / Math.max(0.1, (now - started) / 1000);
                        const percent = file.size ? Math.min(100, Math.round(bytes / file.size * 100)) : 100;
                        toast.loading(`${file.name} · ${completed + failed + 1}/${selected.length}`, {
                            id: toastId,
                            description: `${percent}% · ${formatFileSize(bytes)} / ${formatFileSize(file.size)} · ${formatFileSize(speed)}/s${bytes === file.size ? " · Finishing…" : ""}`,
                        });
                    });
                    completed++;
                } catch (uploadError) {
                    if (controller.signal.aborted) throw uploadError;
                    failed++;
                    toast.error(`${file.name}: ${uploadError instanceof Error ? uploadError.message : "Upload failed"}`);
                }
            }
            if (failed) toast.error(`${completed} uploaded, ${failed} failed`, { id: toastId, description: null });
            else toast.success(`${completed} file${completed === 1 ? "" : "s"} uploaded`, { id: toastId, description: null });
        } catch {
            toast.info(`Upload cancelled · ${completed} completed`, { id: toastId, description: null });
        } finally {
            uploadController.current = null;
            if (mounted.current) {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
                void fetchFiles(currentPath);
            }
        }
    };

    const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        void uploadFiles(Array.from(event.target.files || []));
    };

    // Actions
    const handleDelete = async () => {
        if (!fileToDelete) return;
        if (!canDelete) {
            toast.error("Delete permission required");
            return;
        }
        try {
            const target = `${currentPath}/${fileToDelete.name}`;
            const res = await fetch("/api/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: target }),
            });
            if (!res.ok) throw new Error("Delete failed");
            toast.success("Deleted successfully");
            fetchFiles(currentPath);
            setDeleteDialogOpen(false);
        } catch {
            toast.error("Failed to delete");
        }
    };

    const handleRename = async () => {
        if (!fileToRename || !newFileName) return;
        if (!canDelete) {
            toast.error("Rename permission required");
            return;
        }
        try {
            const oldPath = `${currentPath}/${fileToRename.name}`;
            const res = await fetch("/api/rename", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPath, newName: newFileName }),
            });
            if (res.status === 409) {
                toast.error("File already exists");
                return;
            }
            if (!res.ok) throw new Error("Rename failed");
            toast.success("Renamed successfully");
            fetchFiles(currentPath);
            setRenameDialogOpen(false);
        } catch {
            toast.error("Failed to rename");
        }
    };

    const handleShare = async () => {
        if (!fileToShare) return;
        setIsSharing(true);
        try {
            const filePath = `${currentPath}/${fileToShare.name}`;
            const res = await fetch("/api/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    path: filePath, 
                    password: sharePassword || null 
                }),
            });
            if (!res.ok) throw new Error("Share failed");
            const data = await res.json();
            setShareLink(`${window.location.origin}${data.link}`);
            setShareId(data.id ?? null);
        } catch {
            toast.error("Failed to create share link");
        } finally {
            setIsSharing(false);
        }
    };

    const copyShareLink = () => {
        navigator.clipboard.writeText(shareLink);
        toast.success("Link copied to clipboard");
    };

    const openShareDialog = async (file: FileItem) => {
        setFileToShare(file);
        setSharePassword("");
        setShareLink("");
        setShareId(null);
        setShareDialogOpen(true);
        setIsLoadingShare(true);
        if (!isLoggedIn) {
            setIsLoadingShare(false);
            return;
        }
        try {
            const res = await fetch("/api/share");
            if (res.ok) {
                const shares = await res.json() as { id: string; file_path: string }[];
                const filePath = `${currentPath}/${file.name}`.replace(/^\/+/, "").replace(/\\/g, "/");
                const existing = shares.find((s: { file_path: string }) => s.file_path === filePath);
                if (existing) {
                    setShareLink(`${typeof window !== "undefined" ? window.location.origin : ""}/u/${existing.id}`);
                    setShareId(existing.id);
                }
            }
        } catch {
            // ignore
        } finally {
            setIsLoadingShare(false);
        }
    };

    const handleRevokeShare = async () => {
        if (!shareId) return;
        setIsRevoking(true);
        try {
            const res = await fetch("/api/share", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shareId }) });
            if (!res.ok) throw new Error("Revoke failed");
            setShareLink("");
            setShareId(null);
            toast.success("Share link revoked");
        } catch {
            toast.error("Failed to revoke share link");
        } finally {
            setIsRevoking(false);
        }
    };

    // Helper to get icon - minimal style, smaller on mobile
    const getFileIcon = (mimetype: string) => {
        const iconClass = "h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground";
        if (mimetype.startsWith("image/")) return <ImageIcon className={iconClass} />;
        if (mimetype.startsWith("video/")) return <Film className={iconClass} />;
        if (mimetype.startsWith("audio/")) return <Music className={iconClass} />;
        return <FileText className={iconClass} />;
    };

    return (
        <>
            <div
                className={cn("relative flex flex-col gap-2 sm:gap-4 h-full", dragging && "outline-2 outline-dashed outline-primary outline-offset-4")}
                onDragOver={event => { if (canUpload && !uploading && !error && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
                onDrop={event => { event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}
            >
                {dragging && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/90 text-lg font-medium">Drop files to upload</div>}
                {/* Toolbar - compact on mobile */}
                <div className="flex flex-col gap-2 sm:gap-3 bg-card p-2 sm:p-4 rounded-lg border shadow-sm">
                    {/* Top row - Navigation and actions */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-between items-start sm:items-center">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                            {/* Back Button */}
                            {isAtRoot ? (
                                <Button variant="ghost" size="icon" disabled className="opacity-50 h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                                    <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Button>
                            ) : (
                                <Link href={getFilesUrl(currentPath.split('/').slice(0, -1).join('/') || 'public')} passHref>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                                        <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    </Button>
                                </Link>
                            )}
                            <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground bg-muted px-2 py-1 sm:px-3 sm:py-1.5 rounded-md min-w-0">
                                <span className="font-semibold text-foreground truncate">/{currentPath}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            {isLoggedIn && (
                                <div className="flex items-center border rounded-md overflow-hidden">
                                    <button
                                        onClick={() => handleRootSwitch("public")}
                                        className={cn("px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm", currentPath.startsWith("public") ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                    >
                                        Public
                                    </button>
                                    <button
                                        onClick={() => handleRootSwitch("private")}
                                        className={cn("px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm flex items-center gap-0.5 sm:gap-1", currentPath.startsWith("private") ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                    >
                                        <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Private
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center border rounded-md overflow-hidden">
                                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="rounded-none h-8 w-8 sm:h-9 sm:w-9" aria-label="Grid view" onClick={() => { setViewMode("grid"); savePreferences({ view: "grid" }); }}>
                                    <Grid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Button>
                                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="rounded-none h-8 w-8 sm:h-9 sm:w-9" aria-label="List view" onClick={() => { setViewMode("list"); savePreferences({ view: "list" }); }}>
                                    <ListIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Button>
                            </div>

                            {/* Preview Toggle */}
                            <Button
                                variant={previewsEnabled ? "secondary" : "ghost"}
                                size="icon"
                                className="hidden md:inline-flex h-8 w-8 sm:h-9 sm:w-9"
                                onClick={handleTogglePreviews}
                                title={previewsEnabled ? "Disable previews" : "Enable previews"}
                            >
                                {previewsEnabled ? <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                            </Button>

                            {/* Sort Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm">
                                        Sort
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => { setSortMethod("name"); savePreferences({ sort: "name" }); }}>
                                        Name {sortMethod === "name" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSortMethod("date"); savePreferences({ sort: "date" }); }}>
                                        Date {sortMethod === "date" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSortMethod("size"); savePreferences({ sort: "size" }); }}>
                                        Size {sortMethod === "size" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Order</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => { setSortOrder("asc"); savePreferences({ order: "asc" }); }}>
                                        Ascending {sortOrder === "asc" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSortOrder("desc"); savePreferences({ order: "desc" }); }}>
                                        Descending {sortOrder === "desc" && "✓"}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {canUpload && <Button variant="outline" size="sm" disabled={!!error} onClick={() => setFolderDialogOpen(true)}><FolderPlus className="mr-1 h-4 w-4" /> New folder</Button>}
                            <Button variant="ghost" size="icon" aria-label="Refresh files" title="Refresh files" disabled={loading || !!error} onClick={() => void fetchFiles(currentPath)}>
                                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                            </Button>
                            {uploading && <Button variant="outline" size="sm" onClick={() => uploadController.current?.abort()}><X className="mr-1 h-4 w-4" /> Cancel upload</Button>}
                            <Button
                                disabled={!canUpload || uploading || !!error}
                                variant={!canUpload ? "outline" : "default"}
                                size="sm"
                                className={cn("h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm", !canUpload && "opacity-50 cursor-not-allowed")}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> Upload
                            </Button>
                            <input
                                type="file"
                                multiple
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleUpload}
                            />
                        </div>
                    </div>

                    {/* Bottom row - Search and filters */}
                    <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                            <Input
                                ref={searchInputRef}
                                aria-label="Search files"
                                placeholder="Search files… ( / )"
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                                className="pl-8 h-8 sm:pl-9 sm:h-9 text-sm"
                            />
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1.5 h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm">
                                    <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    <span className="truncate">{filterType === "all" ? "All" : filterType.charAt(0).toUpperCase() + filterType.slice(1)}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("all"); }}>
                                    <File className="mr-2 h-4 w-4" /> All Files {filterType === "all" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("folders"); }}>
                                    <Folder className="mr-2 h-4 w-4" /> Folders {filterType === "folders" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("images"); }}>
                                    <ImageIcon className="mr-2 h-4 w-4" /> Images {filterType === "images" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("videos"); }}>
                                    <Film className="mr-2 h-4 w-4" /> Videos {filterType === "videos" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("audio"); }}>
                                    <Music className="mr-2 h-4 w-4" /> Audio {filterType === "audio" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setPage(0); setFilterType("documents"); }}>
                                    <FileText className="mr-2 h-4 w-4" /> Documents {filterType === "documents" && "✓"}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>


                {/* File Area */}
                {error ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <div className="text-center">
                            <p className="text-destructive text-lg font-semibold mb-2">{error}</p>
                            {errorType === "no_permissions" && (
                                <p className="text-muted-foreground text-sm">Contact an administrator to request access.</p>
                            )}
                        </div>
                    </div>
                ) : loading && files.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <Folder className="h-16 w-16 mb-4 opacity-50" />
                        <p>Directory is empty</p>
                    </div>
                ) : filteredAndSortedFiles.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <Search className="h-16 w-16 mb-4 opacity-50" />
                        <p>No files match your search</p>
                        <Button variant="link" onClick={() => { setSearchQuery(""); setFilterType("all"); }}>
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <div
                        className={cn("flex-1 min-h-0 overflow-auto content-start",
                            viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3" : "flex flex-col gap-1.5 sm:gap-2"
                        )}
                    >
                        {visibleFiles.map((file) => {
                            const fileLink = getFilesUrl(currentPath, file.name);

                            const isPreviewable = previewsEnabled && !file.isDirectory && (file.size ?? 0) <= PREVIEW_MAX_SIZE_BYTES && (
                                file.mimetype.startsWith("image/") ||
                                file.mimetype.startsWith("video/") ||
                                file.mimetype.startsWith("audio/") ||
                                file.mimetype.includes("text") ||
                                file.name.toLowerCase().endsWith('.mov') ||
                                file.name.toLowerCase().endsWith('.mp4') ||
                                file.name.toLowerCase().endsWith('.pdf')
                            );

                            return (
                                <div
                                    key={file.name}
                                    className={cn(
                                        "group relative border rounded-lg hover:bg-muted/50 transition-colors",
                                        viewMode === "grid" ? "flex flex-col items-center gap-2 sm:gap-3 text-center aspect-[4/5] justify-center" : "flex items-center gap-2 sm:gap-4"
                                    )}
                                    onMouseEnter={(e) => handleFileMouseEnter(e, file, isPreviewable)}
                                    onMouseLeave={handleFileMouseLeave}
                                >
                                    <div className="flex-1 flex w-full h-full items-center cursor-pointer overflow-hidden">
                                        <FileLink directory={file.isDirectory} href={fileLink} className={cn("flex-1 flex w-full h-full items-center min-w-0", viewMode === "grid" ? "flex-col justify-center p-2 sm:p-4 content-center" : "gap-2 sm:gap-4 p-2 sm:p-3")}>
                                            {/* Preview/Icon */}
                                            <div className="relative pointer-events-none shrink-0">
                                                {file.isDirectory ? (
                                                    <Folder className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                                                ) : (
                                                    getFileIcon(file.mimetype)
                                                )}
                                            </div>

                                            <div className={cn("min-w-0 text-foreground", viewMode === "list" && "text-left flex-1")}>
                                                <p className="text-xs sm:text-sm font-medium truncate w-full">{file.name}</p>
                                                {viewMode === "list" && <p className="text-[10px] sm:text-xs text-muted-foreground">{formatFileSize(file.size)} • {new Date(file.modified).toLocaleDateString()}</p>}
                                            </div>
                                        </FileLink>
                                    </div>

                                    {/* Actions Menu */}
                                    <div onClick={(e) => e.stopPropagation()} className="z-10 relative">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button aria-label={`Actions for ${file.name}`} variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity mr-1 sm:mr-2 shrink-0">
                                                    <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {!file.isDirectory && (
                                                    <DropdownMenuItem onClick={() => window.open(`${fileLink}?download=1`, '_blank')}>
                                                        <Download className="mr-2 h-4 w-4" /> Download
                                                    </DropdownMenuItem>
                                                )}
                                                {canDelete && (
                                                    <DropdownMenuItem onClick={() => { setFileToRename(file); setNewFileName(file.name); setRenameDialogOpen(true); }}>
                                                        <Edit className="mr-2 h-4 w-4" /> Rename
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem disabled={currentPath.startsWith("public")} onClick={() => !currentPath.startsWith("public") && openShareDialog(file)}>
                                                    <Share2 className="mr-2 h-4 w-4" /> Share
                                                </DropdownMenuItem>
                                                {canDelete && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setFileToDelete(file); setDeleteDialogOpen(true); }}>
                                                            <Trash className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!error && files.length > 0 && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground" aria-live="polite">
                    <span>{filteredAndSortedFiles.length.toLocaleString()} of {files.length.toLocaleString()} items{canUpload ? " · Drop files to upload" : ""}</span>
                    {pageCount > 1 && <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" aria-label="Previous page" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); closePreview(); }}><ChevronLeft className="h-4 w-4" /></Button>
                        <span>Page {currentPage + 1} of {pageCount}</span>
                        <Button variant="outline" size="sm" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => { setPage(currentPage + 1); closePreview(); }}><ChevronRight className="h-4 w-4" /></Button>
                    </div>}
                </div>}

                {/* Dialogs - mobile: contain in viewport, scroll if needed */}
                <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>Create a folder in /{currentPath}.</DialogDescription></DialogHeader>
                        <form onSubmit={createFolder} className="space-y-4">
                            <Input autoFocus aria-label="Folder name" value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Folder name" required />
                            <DialogFooter><Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={creatingFolder || !folderName.trim()}>{creatingFolder ? "Creating…" : "Create folder"}</Button></DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
                <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                    <DialogContent className="max-h-[85vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Rename {fileToRename?.isDirectory ? "Folder" : "File"}</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            <Input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="New name" />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleRename}>Rename</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogContent className="max-h-[85vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="truncate pr-8">Delete {fileToDelete?.name}?</DialogTitle>
                            <DialogDescription>This action cannot be undone.</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                    <DialogContent className="max-h-[85vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Share {fileToShare?.name}</DialogTitle>
                            <DialogDescription>Create a shareable link for this file.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4 min-w-0">
                            {isLoadingShare ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : !shareLink ? (
                                <>
                                    <div className="grid gap-2 min-w-0">
                                        <label className="text-sm font-medium">Password (optional)</label>
                                        <Input 
                                            type="text" 
                                            value={sharePassword} 
                                            onChange={(e) => setSharePassword(e.target.value)}
                                            placeholder="Leave empty for no password"
                                        />
                                        <p className="text-xs text-muted-foreground">Anyone with this link will be able to view and download the file.</p>
                                    </div>
                                    <Button onClick={handleShare} disabled={isSharing} className="w-full">
                                        {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                                        Create Share Link
                                    </Button>
                                </>
                            ) : (
                                <div className="space-y-4 min-w-0">
                                    <div className="p-3 bg-muted rounded-lg min-w-0 overflow-hidden">
                                        <p className="text-xs text-muted-foreground mb-1">Shareable Link</p>
                                        <code className="text-sm break-all block">{shareLink}</code>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Button onClick={copyShareLink} className="flex-1 min-w-0">
                                            Copy Link
                                        </Button>
                                        <Button variant="outline" onClick={() => window.open(shareLink, "_blank")} className="min-w-0">
                                            Open
                                        </Button>
                                        {shareId && (
                                            <Button variant="destructive" onClick={handleRevokeShare} disabled={isRevoking} className="min-w-0">
                                                {isRevoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Revoke
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Floating Preview */}
            {hoveredFile && (
                <div
                    ref={previewRef}
                    className={cn(
                        "hidden md:block fixed z-50 w-80 shadow-2xl bg-card overflow-hidden rounded-lg border-2 border-primary/20"
                    )}
                    style={{
                        left: previewPos.x,
                        top: previewPos.y,
                    }}
                    onMouseEnter={handlePreviewMouseEnter}
                    onMouseLeave={handlePreviewMouseLeave}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="p-4 space-y-3">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold truncate">{hoveredFile.name}</h4>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                {hoveredFile.mimetype.split('/')[1]} • {formatFileSize(hoveredFile.size)}
                            </p>
                        </div>
                        <div className="rounded-md border bg-black/5 overflow-hidden">
                            {hoveredFile.mimetype.startsWith("image/") && (
                                <ImagePreview src={getPreviewUrl(currentPath, hoveredFile.name)} />
                            )}
                            {(hoveredFile.mimetype.startsWith("video/") || hoveredFile.name.toLowerCase().endsWith('.mov')) && (
                                <VideoPreview src={getPreviewUrl(currentPath, hoveredFile.name)} />
                            )}
                            {hoveredFile.mimetype.startsWith("audio/") && (
                                <AudioPreview src={getPreviewUrl(currentPath, hoveredFile.name)} />
                            )}
                            {(hoveredFile.mimetype.includes("text") || hoveredFile.mimetype === "application/json") && (
                                <TextPreview src={getPreviewUrl(currentPath, hoveredFile.name)} />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
