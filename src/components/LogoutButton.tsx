"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        toast.success("Logged out");
        router.refresh();
    };

    return (
        <Button variant="outline" onClick={handleLogout}>Logout</Button>
    );
}
