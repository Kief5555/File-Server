import db from '@/lib/db';
import { notFound } from 'next/navigation';
import ShareView from '@/components/ShareView';

interface PageProps {
    params: { id: string };
}
// Note: In Next 15, params is Promise. In 14, it's object. 
// "next": "16.1.6" -> params is a Promise.

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // We can't prepare usage if we import db directly in Page component (Server Component).
    // Yes we can, it runs on server.

    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as any;

    if (!share) {
        notFound();
    }

    return (
        <div className="h-screen w-full flex items-center justify-center bg-background">
            <ShareView shareId={share.id} hasPassword={!!share.password} fileName={share.file_path.split('/').pop()} />
        </div>
    );
}
