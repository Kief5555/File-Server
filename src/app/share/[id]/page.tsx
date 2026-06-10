import db from '@/lib/db';
import { notFound } from 'next/navigation';
import ShareView from '@/components/ShareView';

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const share = db.prepare('SELECT id, file_path, password, expires_at FROM shares WHERE id = ?').get(id) as {
        id: string;
        file_path: string;
        password: string | null;
        expires_at: string | null;
    } | undefined;

    if (!share) {
        notFound();
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
        notFound();
    }

    return (
        <div className="h-screen w-full flex items-center justify-center bg-background">
            <ShareView shareId={share.id} hasPassword={!!share.password} fileName={share.file_path.split('/').pop() || 'File'} />
        </div>
    );
}
