"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, File, Lock, Image, Film, Music, FileText } from "lucide-react";

interface ShareViewProps {
    shareId: string;
    hasPassword: boolean;
    fileName: string;
}

function getFileIcon(fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    
    if (imageExts.includes(ext)) return <Image className="h-16 w-16 text-muted-foreground" />;
    if (videoExts.includes(ext)) return <Film className="h-16 w-16 text-muted-foreground" />;
    if (audioExts.includes(ext)) return <Music className="h-16 w-16 text-muted-foreground" />;
    return <FileText className="h-16 w-16 text-muted-foreground" />;
}

function getFileType(fileName: string): 'image' | 'video' | 'audio' | 'other' {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    return 'other';
}

export default function ShareView({ shareId, hasPassword, fileName }: ShareViewProps) {
    const [password, setPassword] = useState("");
    const [unlocked, setUnlocked] = useState(!hasPassword);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    
    const fileType = getFileType(fileName);

    useEffect(() => {
        if (unlocked) {
            const url = `/api/share/${shareId}/download${hasPassword ? `?password=${encodeURIComponent(password)}` : ''}`;
            setPreviewUrl(url);
        }
    }, [unlocked, shareId, hasPassword, password]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/share/${shareId}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                setUnlocked(true);
            } else {
                toast.error("Incorrect password");
            }
        } catch (error) {
            toast.error("Error verifying password");
        }
    };

    const handleDownload = () => {
        const url = `/api/share/${shareId}/download${hasPassword ? `?password=${encodeURIComponent(password)}&download=1` : '?download=1'}`;
        window.open(url, '_blank');
    };

    if (!unlocked) {
        return (
            <Card className="w-full max-w-sm">
                <CardHeader className="text-center">
                    <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <CardTitle>Protected File</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUnlock} className="grid gap-4">
                        <div className="grid gap-2">
                            <label className="text-sm text-muted-foreground">Enter password to access this file</label>
                            <Input 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                autoFocus
                            />
                        </div>
                        <Button type="submit" className="w-full">Unlock</Button>
                    </form>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader className="text-center border-b">
                <CardTitle className="flex items-center justify-center gap-3">
                    {getFileIcon(fileName)}
                    <span className="break-all text-lg">{fileName}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                {previewUrl && fileType === 'image' && (
                    <div className="flex justify-center mb-4">
                        <img 
                            src={previewUrl} 
                            alt={fileName} 
                            className="max-h-96 rounded-lg shadow-md object-contain"
                        />
                    </div>
                )}
                {previewUrl && fileType === 'video' && (
                    <div className="flex justify-center mb-4">
                        <video 
                            src={previewUrl} 
                            controls 
                            className="max-h-96 rounded-lg shadow-md w-full"
                        />
                    </div>
                )}
                {previewUrl && fileType === 'audio' && (
                    <div className="flex justify-center mb-4">
                        <audio src={previewUrl} controls className="w-full" />
                    </div>
                )}
                {fileType === 'other' && (
                    <div className="flex justify-center py-8">
                        <File className="h-24 w-24 text-muted-foreground" />
                    </div>
                )}
            </CardContent>
            <CardFooter className="justify-center border-t pt-4">
                <Button onClick={handleDownload} size="lg">
                    <Download className="mr-2 h-4 w-4" /> Download File
                </Button>
            </CardFooter>
        </Card>
    );
}
