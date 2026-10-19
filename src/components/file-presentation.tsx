import { Archive, File, FileCode2, FileText, Folder, Image as ImageIcon, Film, Music } from 'lucide-react';
import type { FileItem } from '@/lib/directory';

export const fileFilters = [
    { id: 'all', label: 'All items', icon: File },
    { id: 'folders', label: 'Folders', icon: Folder },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'documents', label: 'Documents', icon: FileText },
] as const;
export type FileFilter = typeof fileFilters[number]['id'];

export function filePresentation(file: FileItem) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : '';
    if (file.isDirectory) return { icon: Folder, kind: 'folder', label: 'Folder' };
    if (file.mimetype.startsWith('image/')) return { icon: ImageIcon, kind: 'image', label: extension || 'Image' };
    if (file.mimetype.startsWith('video/') || /\.(mov|mp4)$/i.test(file.name)) return { icon: Film, kind: 'video', label: extension || 'Video' };
    if (file.mimetype.startsWith('audio/')) return { icon: Music, kind: 'audio', label: extension || 'Audio' };
    if (/\.(zip|rar|7z|gz|tar|bz2)$/i.test(file.name)) return { icon: Archive, kind: 'archive', label: extension };
    if (/\.(json|js|ts|tsx|jsx|html|css|py|sh|xml|yaml|yml)$/i.test(file.name)) return { icon: FileCode2, kind: 'code', label: extension };
    return { icon: FileText, kind: 'document', label: extension.length <= 7 && extension ? extension : 'File' };
}
