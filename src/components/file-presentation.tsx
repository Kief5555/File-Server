import { File, FileText, Folder, Image as ImageIcon, Film, Music } from 'lucide-react';
import type { FileItem } from '@/lib/directory';
import iconExtensions from '@/lib/file-icon-extensions.json';

export const fileFilters = [
    { id: 'all', label: 'All items', icon: File },
    { id: 'folders', label: 'Folders', icon: Folder },
    { id: 'images', label: 'Images', icon: ImageIcon },
    { id: 'videos', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'documents', label: 'Documents', icon: FileText },
] as const;
export type FileFilter = typeof fileFilters[number]['id'];

// Keep extension aliases in the same catalog as the bundled Fluent SVGs.
const extensionIcons = new Map<string, string>();
for (const [icon, extensions] of Object.entries(iconExtensions)) {
    for (const extension of extensions) extensionIcons.set(extension, icon);
}
for (const extension of ['ts', 'tsx', 'mts', 'cts', 'mjs', 'cjs', 'yml', 'yaml']) extensionIcons.set(extension, 'code');
for (const extension of ['csv', 'tsv', 'ods']) extensionIcons.set(extension, 'xlsx');
for (const extension of ['webp', 'avif']) extensionIcons.set(extension, 'photo');
for (const extension of ['opus', 'oga']) extensionIcons.set(extension, 'audio');
for (const extension of ['bz2', 'xz', 'zst']) extensionIcons.set(extension, 'archive');
for (const extension of ['msix', 'xapk', 'dmg', 'pkg', 'deb', 'rpm']) extensionIcons.set(extension, 'exe');

// Prefer Finder artwork; keep Fluent icons for Office and Windows-specific files.
const finderIcons: Record<string, string> = {
    folder: 'folder', genericfile: 'generic', photo: 'image', video: 'video', audio: 'audio',
    code: 'code', txt: 'txt', html: 'code', xml: 'code', vector: 'image',
    archive: 'archive', zip: 'archive', font: 'font', pdf: 'pdf',
};
const applePackages: Record<string, string> = { ipa: 'ipa', dmg: 'dmg', sparseimage: 'dmg', sparsebundle: 'dmg', pkg: 'pkg', mpkg: 'pkg', app: 'application' };

export function filePresentation(file: FileItem) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    let icon = file.isDirectory ? 'folder' : extensionIcons.get(extension);
    if (!file.isDirectory) {
        if (file.mimetype.startsWith('image/') && extension !== 'svg') icon = 'photo';
        else if (file.mimetype.startsWith('video/')) icon = 'video';
        else if (file.mimetype.startsWith('audio/')) icon = 'audio';
        if (!icon) {
            if (file.mimetype === 'application/pdf') icon = 'pdf';
            else if (/spreadsheet|excel/.test(file.mimetype)) icon = 'xlsx';
            else if (/presentation|powerpoint/.test(file.mimetype)) icon = 'pptx';
            else if (/wordprocessing|msword/.test(file.mimetype)) icon = 'docx';
            else if (file.mimetype.startsWith('text/')) icon = 'txt';
        }
    }
    icon ||= 'genericfile';
    const label = file.isDirectory ? 'Folder' : extension && extension.length <= 7 ? extension.toUpperCase() : 'File';
    const finderIcon = file.isDirectory ? 'folder' : applePackages[extension] || finderIcons[icon];
    const iconSrc = finderIcon ? `/icons/file-types/macos/${finderIcon}.png` : `/icons/file-types/${icon}.svg`;
    return { iconSrc, kind: finderIcon || icon, label };
}
