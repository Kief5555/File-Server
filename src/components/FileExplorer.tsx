"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Folder, File, FileText, Image as ImageIcon, Film, MoreVertical, Trash, Edit, Upload, Grid, List as ListIcon, Loader2, Download, Share2, Lock, Shield, ArrowUp, Search, Eye, EyeOff, Filter, Music, Play, Pause } from "lucide-react";
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
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress"; // Need to install Progress if not present, otherwise generic simplified
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Interface definitions
interface FileItem {
    name: string;
    isDirectory: boolean;
    size: number;
    mimetype: string;
    modified: string;
}

interface FileExplorerProps {
    initialPath?: string;
    initialFiles?: FileItem[];
    isLoggedIn?: boolean;
    error?: string | null;
    errorType?: "unauthorized" | "no_permissions" | "other";
}

const formatFileSize = (bytes: number) => {
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
                preload="auto"
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
        <div className="relative">
            {loading && (
                <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}
            <img
                src={src}
                alt="preview"
                className="w-full h-auto object-contain max-h-48"
                onLoad={() => setLoading(false)}
                onError={() => { setError(true); setLoading(false); }}
            />
        </div>
    );
};

const TextPreview = ({ src }: { src: string }) => {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(src)
            .then(res => res.text())
            .then(text => {
                setContent(text.slice(0, 2000)); // Limit to first 2000 chars
                setLoading(false);
            })
            .catch(() => {
                setContent("Failed to load preview");
                setLoading(false);
            });
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

export default function FileExplorer({ initialPath = "public", initialFiles = [], isLoggedIn = false, error = null, errorType = "other" }: FileExplorerProps) {
    const [currentPath, setCurrentPath] = useState(initialPath);
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
    
    const isAtRoot = currentPath === "public" || currentPath === "private";

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
    const [isSharing, setIsSharing] = useState(false);

    // Preview State - simplified: click to pin, click elsewhere to close
    const [hoveredFile, setHoveredFile] = useState<FileItem | null>(null);
    const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
    const [isPinned, setIsPinned] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const closePreview = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setHoveredFile(null);
        setIsPinned(false);
    };

    const handleFileMouseEnter = (e: React.MouseEvent, file: FileItem, isPreviewable: boolean) => {
        // Don't change preview if pinned
        if (isPinned) return;
        
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        
        if (isPreviewable) {
            setPreviewPos({ x: e.clientX, y: e.clientY });
            setHoveredFile(file);
        }
    };

    const handleFileMouseLeave = () => {
        // Don't close if pinned
        if (isPinned) return;
        
        // Small delay before closing to allow moving to preview
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredFile(null);
        }, 300);
    };

    const handlePreviewMouseEnter = () => {
        // Cancel close timeout when entering preview
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
    };

    const handlePreviewMouseLeave = () => {
        // Close when leaving preview (unless pinned)
        if (!isPinned) {
            closePreview();
        }
    };

    const handlePreviewClick = (e: React.MouseEvent) => {
        // Only pin/unpin if clicking directly on the preview container, not on media inside
        // Check if the click target is a media element or inside a media container
        const target = e.target as HTMLElement;
        const isMediaElement = target.tagName === 'VIDEO' || 
                               target.tagName === 'AUDIO' || 
                               target.closest('video') || 
                               target.closest('audio') ||
                               target.closest('[data-media-controls]');
        
        if (isMediaElement) {
            // Don't pin when clicking on media - just stop propagation
            e.stopPropagation();
            return;
        }
        
        // Clicking on the preview container toggles pin
        e.stopPropagation();
        setIsPinned(!isPinned);
    };

    const handleUnpin = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsPinned(false);
    };

    // Close preview on outside click (but not when clicking a file/folder link - let that click through)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (previewRef.current && previewRef.current.contains(e.target as Node)) {
                return;
            }
            // Don't close on file/folder link click so a single click opens or downloads the file
            const target = e.target as HTMLElement;
            if (target.closest('a[href*="/files/"]')) {
                return;
            }
            closePreview();
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    // Sync state with prop if it changes (URL driven)
    useEffect(() => {
        setCurrentPath(initialPath);
        if (initialFiles.length > 0) {
            setFiles(initialFiles);
        }
    }, [initialPath, initialFiles]);

    // Fetch Files
    const fetchFiles = async (path: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/files/${path}`);
            if (res.status === 401) {
                // If unauthorized and trying to access private, redirect or show error
                if (path.startsWith("private")) {
                    toast.error("Unauthorized access to private files");
                    setCurrentPath("public");
                }
            }
            if (!res.ok) throw new Error("Failed to fetch files");
            const data = await res.json();
            setFiles(data.files || []);
        } catch (error) {
            console.error(error);
            toast.error("Error loading files");
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only fetch if initialFiles are empty or path changed and we don't have them
        if (initialFiles.length === 0 || currentPath !== initialPath) {
            fetchFiles(currentPath);
        }
    }, [currentPath]);

    // Filter and Sort Logic
    const filteredAndSortedFiles = [...files]
        .filter(file => {
            // Search filter
            if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
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
                res = a.name.localeCompare(b.name);
            } else if (sortMethod === "size") {
                res = a.size - b.size;
            } else if (sortMethod === "date") {
                res = new Date(a.modified).getTime() - new Date(b.modified).getTime();
            }
            return sortOrder === "asc" ? res : -res;
        });

    // Navigation
    const handleNavigate = (folderName: string) => {
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        setCurrentPath(newPath);
    };

    const handleGoUp = () => {
        if (currentPath === "public" || currentPath === "private") return;
        const parts = currentPath.split("/");
        parts.pop();
        setCurrentPath(parts.join("/"));
    };

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
        toast(newState ? "Previews enabled" : "Previews disabled", {
            icon: newState ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
        });
        if (!newState) {
            // Close any open preview when disabling
            setHoveredFile(null);
        }
    };

    // Upload with toast progress showing speed, ETA, and size
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const file = fileList[0];
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const identifier = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const startTime = Date.now();

        const formatBytes = (bytes: number) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };

        const formatETA = (seconds: number) => {
            if (!isFinite(seconds) || seconds < 0) return '--:--';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const updateToast = (toastId: string | number, bytesUploaded: number, progress: number) => {
            const elapsed = (Date.now() - startTime) / 1000; // seconds
            const speed = elapsed > 0 ? bytesUploaded / elapsed : 0; // bytes per second
            const remaining = file.size - bytesUploaded;
            const eta = speed > 0 ? remaining / speed : 0;

            toast.loading(
                <div className="w-full min-w-[280px]">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="truncate max-w-[160px] font-medium">{file.name}</span>
                        <span className="font-mono">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mb-2">
                        <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatBytes(bytesUploaded)} / {formatBytes(file.size)}</span>
                        <span>{formatBytes(speed)}/s • ETA {formatETA(eta)}</span>
                    </div>
                </div>,
                { id: toastId, duration: Infinity }
            );
        };

        const toastId = toast.loading(
            <div className="w-full min-w-[280px]">
                <div className="flex justify-between text-sm mb-1">
                    <span className="truncate max-w-[160px] font-medium">{file.name}</span>
                    <span className="font-mono">0%</span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mb-2">
                    <div className="bg-primary h-full transition-all" style={{ width: '0%' }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 B / {formatBytes(file.size)}</span>
                    <span>Calculating...</span>
                </div>
            </div>,
            { duration: Infinity }
        );

        try {
            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append("file", chunk);
                formData.append("chunkIndex", i.toString());
                formData.append("totalChunks", totalChunks.toString());
                formData.append("identifier", identifier);
                formData.append("fileName", file.name);

                const res = await fetch(`/api/upload?path=${currentPath}`, {
                    method: "POST",
                    body: formData,
                });

                if (!res.ok) throw new Error(`Failed to upload chunk ${i}`);

                const bytesUploaded = end;
                const progress = (bytesUploaded / file.size) * 100;
                updateToast(toastId, bytesUploaded, progress);
            }

            toast.success(
                <div>
                    <div className="font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                        {formatBytes(file.size)} uploaded successfully
                    </div>
                </div>,
                { id: toastId }
            );
            fetchFiles(currentPath);
        } catch (error) {
            console.error(error);
            toast.error(`Failed to upload ${file.name}`, { id: toastId });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Actions
    const handleDelete = async () => {
        if (!fileToDelete) return;
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
        } catch (error) {
            toast.error("Failed to delete");
        }
    };

    const handleRename = async () => {
        if (!fileToRename || !newFileName) return;
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
        } catch (error) {
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
        } catch (error) {
            toast.error("Failed to create share link");
        } finally {
            setIsSharing(false);
        }
    };

    const copyShareLink = () => {
        navigator.clipboard.writeText(shareLink);
        toast.success("Link copied to clipboard");
    };

    const openShareDialog = (file: FileItem) => {
        setFileToShare(file);
        setSharePassword("");
        setShareLink("");
        setShareDialogOpen(true);
    };

    // Helper to get icon - minimal style
    const getFileIcon = (mimetype: string) => {
        if (mimetype.startsWith("image/")) return <ImageIcon className="h-10 w-10 text-muted-foreground" />;
        if (mimetype.startsWith("video/")) return <Film className="h-10 w-10 text-muted-foreground" />;
        if (mimetype.startsWith("audio/")) return <Music className="h-10 w-10 text-muted-foreground" />;
        return <FileText className="h-10 w-10 text-muted-foreground" />;
    };

    return (
        <>
            <div className="flex flex-col h-full gap-4">
                {/* Toolbar */}
                <div className="flex flex-col gap-3 bg-card p-4 rounded-lg border shadow-sm">
                    {/* Top row - Navigation and actions */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                        <div className="flex items-center gap-2">
                            {/* Back Button */}
                            {isAtRoot ? (
                                <Button variant="ghost" disabled className="opacity-50">
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Link href={`/files/${currentPath.split('/').slice(0, -1).join('/') || 'public'}`} passHref>
                                    <Button variant="ghost">
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                </Link>
                            )}
                            <div className="flex items-center gap-1 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                                <span className="font-semibold text-foreground">/{currentPath}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {isLoggedIn && (
                                <div className="flex items-center border rounded-md overflow-hidden">
                                    <button
                                        onClick={() => handleRootSwitch("public")}
                                        className={cn("px-3 py-1.5 text-sm", currentPath.startsWith("public") ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                    >
                                        Public
                                    </button>
                                    <button
                                        onClick={() => handleRootSwitch("private")}
                                        className={cn("px-3 py-1.5 text-sm flex items-center gap-1", currentPath.startsWith("private") ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                    >
                                        <Lock className="h-3 w-3" /> Private
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center border rounded-md overflow-hidden">
                                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="rounded-none" onClick={() => setViewMode("grid")}>
                                    <Grid className="h-4 w-4" />
                                </Button>
                                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="rounded-none" onClick={() => setViewMode("list")}>
                                    <ListIcon className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Preview Toggle */}
                            <Button
                                variant={previewsEnabled ? "secondary" : "ghost"}
                                size="icon"
                                onClick={handleTogglePreviews}
                                title={previewsEnabled ? "Disable previews" : "Enable previews"}
                            >
                                {previewsEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>

                            {/* Sort Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                        Sort
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => setSortMethod("name")}>
                                        Name {sortMethod === "name" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortMethod("date")}>
                                        Date {sortMethod === "date" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortMethod("size")}>
                                        Size {sortMethod === "size" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>Order</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => setSortOrder("asc")}>
                                        Ascending {sortOrder === "asc" && "✓"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSortOrder("desc")}>
                                        Descending {sortOrder === "desc" && "✓"}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button disabled={!isLoggedIn} variant={!isLoggedIn ? "outline" : "default"} className={cn(!isLoggedIn && "opacity-50 cursor-not-allowed")}>
                                        <Upload className="mr-2 h-4 w-4" /> Upload
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                                        File Upload
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled>Folder Upload (Pro)</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleUpload}
                            />
                        </div>
                    </div>

                    {/* Bottom row - Search and filters */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Filter className="h-4 w-4" />
                                    {filterType === "all" ? "All Files" : filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setFilterType("all")}>
                                    <File className="mr-2 h-4 w-4" /> All Files {filterType === "all" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFilterType("folders")}>
                                    <Folder className="mr-2 h-4 w-4" /> Folders {filterType === "folders" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setFilterType("images")}>
                                    <ImageIcon className="mr-2 h-4 w-4" /> Images {filterType === "images" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFilterType("videos")}>
                                    <Film className="mr-2 h-4 w-4" /> Videos {filterType === "videos" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFilterType("audio")}>
                                    <Music className="mr-2 h-4 w-4" /> Audio {filterType === "audio" && "✓"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setFilterType("documents")}>
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
                ) : loading ? (
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
                        className={cn("flex-1 overflow-auto content-start",
                            viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" : "flex flex-col gap-2"
                        )}
                    >
                        {filteredAndSortedFiles.map((file) => {
                            const fileLink = file.isDirectory
                                ? `/files/${currentPath}/${file.name}`
                                : `/files/${currentPath}/${file.name}`;

                            // We wrap the clickable area in a Link or a tag
                            const Wrapper = ({ children, className }: { children: React.ReactNode, className?: string }) => {
                                if (file.isDirectory) {
                                    return <Link href={fileLink} className={className}>{children}</Link>;
                                } else {
                                    return <a href={fileLink} className={className}>{children}</a>;
                                }
                            };

                            const isPreviewable = previewsEnabled && !file.isDirectory && (
                                file.mimetype.startsWith("image/") ||
                                file.mimetype.startsWith("video/") ||
                                file.mimetype.startsWith("audio/") ||
                                file.mimetype.includes("text") ||
                                file.name.toLowerCase().endsWith('.mov') ||
                                file.name.toLowerCase().endsWith('.mp4')
                            );

                            return (
                                <div
                                    key={file.name}
                                    className={cn(
                                        "group relative border rounded-lg hover:bg-muted/50 transition-colors",
                                        viewMode === "grid" ? "flex flex-col items-center gap-3 text-center aspect-[4/5] justify-center" : "flex items-center gap-4"
                                    )}
                                    onMouseEnter={(e) => handleFileMouseEnter(e, file, isPreviewable)}
                                    onMouseLeave={handleFileMouseLeave}
                                >
                                    <div className="flex-1 flex w-full h-full items-center cursor-pointer overflow-hidden">
                                        <Wrapper className={cn("flex-1 flex w-full h-full items-center", viewMode === "grid" ? "flex-col justify-center p-4 content-center" : "gap-4 p-3")}>
                                            {/* Preview/Icon */}
                                            <div className="relative pointer-events-none">
                                                {file.isDirectory ? (
                                                    <Folder className="h-12 w-12 text-muted-foreground" />
                                                ) : (
                                                    getFileIcon(file.mimetype)
                                                )}
                                            </div>

                                            <div className={cn("min-w-0 text-foreground", viewMode === "list" && "text-left flex-1")}>
                                                <p className="text-sm font-medium truncate w-full">{file.name}</p>
                                                {viewMode === "list" && <p className="text-xs text-muted-foreground">{formatFileSize(file.size)} • {new Date(file.modified).toLocaleDateString()}</p>}
                                            </div>
                                        </Wrapper>
                                    </div>

                                    {/* Actions Menu */}
                                    <div onClick={(e) => e.stopPropagation()} className="z-10 relative">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {!file.isDirectory && (
                                                    <DropdownMenuItem onClick={() => window.open(`${fileLink}?download=1`, '_blank')}>
                                                        <Download className="mr-2 h-4 w-4" /> Download
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => { setFileToRename(file); setNewFileName(file.name); setRenameDialogOpen(true); }}>
                                                    <Edit className="mr-2 h-4 w-4" /> Rename
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openShareDialog(file)}>
                                                    <Share2 className="mr-2 h-4 w-4" /> Share
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setFileToDelete(file); setDeleteDialogOpen(true); }}>
                                                    <Trash className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Dialogs */}
                <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                    <DialogContent>
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
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete {fileToDelete?.name}?</DialogTitle>
                            <DialogDescription>This action cannot be undone.</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Share {fileToShare?.name}</DialogTitle>
                            <DialogDescription>Create a shareable link for this file.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                            {!shareLink ? (
                                <>
                                    <div className="grid gap-2">
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
                                <div className="space-y-4">
                                    <div className="p-3 bg-muted rounded-lg">
                                        <p className="text-xs text-muted-foreground mb-1">Shareable Link</p>
                                        <code className="text-sm break-all">{shareLink}</code>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={copyShareLink} className="flex-1">
                                            Copy Link
                                        </Button>
                                        <Button variant="outline" onClick={() => window.open(shareLink, '_blank')}>
                                            Open
                                        </Button>
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

            {/* Floating Preview - click to pin */}
            {hoveredFile && (
                <div
                    ref={previewRef}
                    className={cn(
                        "fixed z-50 w-80 shadow-2xl bg-card overflow-hidden rounded-lg transition-all",
                        isPinned ? "border-2 border-primary" : "border-2 border-primary/20"
                    )}
                    style={{
                        left: previewPos.x + 25,
                        top: previewPos.y + 15,
                        transform: `translate(${previewPos.x + 360 > (typeof window !== 'undefined' ? window.innerWidth : 0) ? '-110%' : '0%'}, ${previewPos.y + 350 > (typeof window !== 'undefined' ? window.innerHeight : 0) ? '-110%' : '0%'})`
                    }}
                    onMouseEnter={handlePreviewMouseEnter}
                    onMouseLeave={handlePreviewMouseLeave}
                    onClick={handlePreviewClick}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* Pin indicator - click to unpin */}
                    {isPinned && (
                        <div className="absolute top-2 left-2 z-10">
                            <button 
                                onClick={handleUnpin}
                                className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-[10px] font-medium hover:bg-primary/80 transition-colors cursor-pointer"
                            >
                                ✕ Unpin
                            </button>
                        </div>
                    )}
                    <div className="p-4 space-y-3">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold truncate">{hoveredFile.name}</h4>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                {hoveredFile.mimetype.split('/')[1]} • {formatFileSize(hoveredFile.size)}
                            </p>
                        </div>
                        <div className="rounded-md border bg-black/5 overflow-hidden">
                            {hoveredFile.mimetype.startsWith("image/") && (
                                <ImagePreview src={`/api/files/${currentPath}/${hoveredFile.name}`} />
                            )}
                            {(hoveredFile.mimetype.startsWith("video/") || hoveredFile.name.toLowerCase().endsWith('.mov')) && (
                                <VideoPreview src={`/api/files/${currentPath}/${hoveredFile.name}`} />
                            )}
                            {hoveredFile.mimetype.startsWith("audio/") && (
                                <AudioPreview src={`/api/files/${currentPath}/${hoveredFile.name}`} />
                            )}
                            {(hoveredFile.mimetype.includes("text") || hoveredFile.mimetype === "application/json") && (
                                <TextPreview src={`/api/files/${currentPath}/${hoveredFile.name}`} />
                            )}
                        </div>
                        <div className="text-[10px] text-center text-muted-foreground italic">
                            {(hoveredFile.mimetype.startsWith("video/") || hoveredFile.name.toLowerCase().endsWith('.mov')) 
                                ? "Click to pin • Play/Hold 2s for 2x" 
                                : hoveredFile.mimetype.startsWith("audio/") 
                                    ? "Click to pin • Play/pause audio"
                                    : "Click to pin preview"}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
