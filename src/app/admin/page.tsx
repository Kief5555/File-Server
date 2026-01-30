"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";
import { Trash, Settings, Users, Upload, Trash2, Lock, Check, X, Key, Copy, Eye, EyeOff } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Label } from "@/components/ui/label";

interface User {
    id: number;
    username: string;
    can_upload: number;
    can_delete: number;
    can_access_private: number;
    is_admin: number;
    created_at: string;
}

export default function AdminPanel() {
    const [users, setUsers] = useState<User[]>([]);
    const [newUserUser, setNewUserUser] = useState("");
    const [newUserPass, setNewUserPass] = useState("");
    const [newUserCanUpload, setNewUserCanUpload] = useState(false);
    const [newUserCanDelete, setNewUserCanDelete] = useState(false);
    const [newUserCanPrivate, setNewUserCanPrivate] = useState(false);
    const [privatePassword, setPrivatePassword] = useState("");
    const [activeTab, setActiveTab] = useState<"users" | "settings" | "api-keys">("users");
    const [apiKeys, setApiKeys] = useState<any[]>([]);
    const [newApiKeyName, setNewApiKeyName] = useState("");
    const [newApiKey, setNewApiKey] = useState<string | null>(null);
    const [isCreatingKey, setIsCreatingKey] = useState(false);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.status === 403) {
                toast.error("Unauthorized");
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (error) {
            toast.error("Failed to load users");
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch("/api/admin/settings");
            if (res.ok) {
                const data = await res.json();
                setPrivatePassword(data.private_password || "");
            }
        } catch (error) {
            toast.error("Failed to load settings");
        }
    };

    const fetchApiKeys = async () => {
        try {
            const res = await fetch("/api/api-keys");
            if (res.ok) {
                const data = await res.json();
                setApiKeys(data);
            }
        } catch (error) {
            toast.error("Failed to load API keys");
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchSettings();
        fetchApiKeys();
    }, []);

    // Check if user has access on mount
    useEffect(() => {
        const checkAccess = async () => {
            const res = await fetch("/api/admin/users");
            if (res.status === 403 || res.status === 401) {
                // Redirect to home if not authorized
                window.location.href = "/files/public";
            }
        };
        checkAccess();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    username: newUserUser, 
                    password: newUserPass,
                    can_upload: newUserCanUpload,
                    can_delete: newUserCanDelete,
                    can_access_private: newUserCanPrivate
                }),
            });

            if (res.ok) {
                toast.success("User created");
                setNewUserUser("");
                setNewUserPass("");
                setNewUserCanUpload(false);
                setNewUserCanDelete(false);
                setNewUserCanPrivate(false);
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to create user");
            }
        } catch (error) {
            toast.error("Error creating user");
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                toast.success("User deleted");
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to delete");
            }
        } catch (error) {
            toast.error("Error deleting user");
        }
    };

    const handleUpdatePermissions = async (user: User, field: string, value: boolean) => {
        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: user.id,
                    can_upload: field === "can_upload" ? value : !!user.can_upload,
                    can_delete: field === "can_delete" ? value : !!user.can_delete,
                    can_access_private: field === "can_access_private" ? value : !!user.can_access_private,
                }),
            });
            if (res.ok) {
                toast.success("Permissions updated");
                fetchUsers();
            } else {
                const data = await res.json();
                toast.error(data.message || "Failed to update");
            }
        } catch (error) {
            toast.error("Error updating permissions");
        }
    };

    const handleSaveSettings = async () => {
        try {
            const res = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ private_password: privatePassword }),
            });
            if (res.ok) {
                toast.success("Settings saved");
            } else {
                toast.error("Failed to save settings");
            }
        } catch (error) {
            toast.error("Error saving settings");
        }
    };

    const handleCreateApiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreatingKey(true);
        try {
            const res = await fetch("/api/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newApiKeyName || null }),
            });
            if (res.ok) {
                const data = await res.json();
                setNewApiKey(data.apiKey);
                setNewApiKeyName("");
                fetchApiKeys();
                toast.success("API key created! Copy it now - it won't be shown again.");
            } else {
                toast.error("Failed to create API key");
            }
        } catch (error) {
            toast.error("Error creating API key");
        } finally {
            setIsCreatingKey(false);
        }
    };

    const handleDeleteApiKey = async (id: number) => {
        if (!confirm("Are you sure you want to delete this API key?")) return;
        try {
            const res = await fetch("/api/api-keys", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                toast.success("API key deleted");
                fetchApiKeys();
            } else {
                toast.error("Failed to delete API key");
            }
        } catch (error) {
            toast.error("Error deleting API key");
        }
    };

    const copyApiKey = (key: string) => {
        navigator.clipboard.writeText(key);
        toast.success("API key copied to clipboard");
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6 bg-card">
                <div className="flex items-center gap-2">
                    <h1 className="text-lg sm:text-xl font-bold">Admin Panel</h1>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <ModeToggle />
                    <Link href="/files/public">
                        <Button variant="outline" size="sm" className="hidden sm:flex">Back to Files</Button>
                        <Button variant="outline" size="sm" className="sm:hidden">Back</Button>
                    </Link>
                </div>
            </header>

            <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
                {/* Sidebar - Mobile: horizontal tabs, Desktop: vertical sidebar */}
                <aside className="sm:w-56 border-b sm:border-b-0 sm:border-r bg-card p-2 sm:p-4">
                    <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-x-visible">
                        <button
                            onClick={() => setActiveTab("users")}
                            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeTab === "users" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                            <Users className="h-4 w-4" />
                            <span className="whitespace-nowrap">Users</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("settings")}
                            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeTab === "settings" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                            <Settings className="h-4 w-4" />
                            <span className="whitespace-nowrap">Settings</span>
                        </button>
                        <button
                            onClick={() => setActiveTab("api-keys")}
                            className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeTab === "api-keys" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                            <Key className="h-4 w-4" />
                            <span className="whitespace-nowrap">API Keys</span>
                        </button>
                    </div>
                </aside>

                <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-w-5xl space-y-6 sm:space-y-8">
                    {activeTab === "users" && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Create User</CardTitle>
                                    <CardDescription>Add a new user with specific permissions.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleCreateUser} className="space-y-4">
                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <div className="grid gap-2 flex-1">
                                                <Label>Username</Label>
                                                <Input value={newUserUser} onChange={(e) => setNewUserUser(e.target.value)} required />
                                            </div>
                                            <div className="grid gap-2 flex-1">
                                                <Label>Password</Label>
                                                <Input type="password" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center">
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={newUserCanUpload} 
                                                    onChange={(e) => setNewUserCanUpload(e.target.checked)}
                                                    className="h-4 w-4 rounded border-muted-foreground"
                                                />
                                                <Upload className="h-4 w-4 text-muted-foreground" />
                                                Can Upload
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={newUserCanDelete} 
                                                    onChange={(e) => setNewUserCanDelete(e.target.checked)}
                                                    className="h-4 w-4 rounded border-muted-foreground"
                                                />
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                Can Delete
                                            </label>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={newUserCanPrivate} 
                                                    onChange={(e) => setNewUserCanPrivate(e.target.checked)}
                                                    className="h-4 w-4 rounded border-muted-foreground"
                                                />
                                                <Lock className="h-4 w-4 text-muted-foreground" />
                                                Access Private
                                            </label>
                                        </div>
                                        <Button type="submit" className="w-full sm:w-auto">Create User</Button>
                                    </form>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Users</CardTitle>
                                    <CardDescription>Manage users and their permissions.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Username</TableHead>
                                                    <TableHead className="text-center">Upload</TableHead>
                                                    <TableHead className="text-center">Delete</TableHead>
                                                    <TableHead className="text-center">Private</TableHead>
                                                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {users.map((user) => (
                                                    <TableRow key={user.id}>
                                                        <TableCell className="font-medium">
                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                                                                <span>{user.username}</span>
                                                                {user.is_admin === 1 && (
                                                                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded w-fit">Admin</span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <button
                                                                onClick={() => user.username !== 'admin' && handleUpdatePermissions(user, "can_upload", !user.can_upload)}
                                                                disabled={user.username === 'admin'}
                                                                className={`p-1 rounded ${user.can_upload ? "text-green-500" : "text-muted-foreground"} ${user.username === 'admin' ? "opacity-50 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                                                            >
                                                                {user.can_upload ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <button
                                                                onClick={() => user.username !== 'admin' && handleUpdatePermissions(user, "can_delete", !user.can_delete)}
                                                                disabled={user.username === 'admin'}
                                                                className={`p-1 rounded ${user.can_delete ? "text-green-500" : "text-muted-foreground"} ${user.username === 'admin' ? "opacity-50 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                                                            >
                                                                {user.can_delete ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <button
                                                                onClick={() => user.username !== 'admin' && handleUpdatePermissions(user, "can_access_private", !user.can_access_private)}
                                                                disabled={user.username === 'admin'}
                                                                className={`p-1 rounded ${user.can_access_private ? "text-green-500" : "text-muted-foreground"} ${user.username === 'admin' ? "opacity-50 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                                                            >
                                                                {user.can_access_private ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                            </button>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                                                            {new Date(user.created_at).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {user.username !== 'admin' && (
                                                                <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.id)}>
                                                                    <Trash className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {activeTab === "settings" && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Private Folder Settings</CardTitle>
                                <CardDescription className="text-sm">
                                    Set a password that allows access to private files via URL parameter.
                                    <br className="hidden sm:block" />
                                    <span className="block sm:inline">Example: </span>
                                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">example.com/files/private/file.png?password=yourpassword</code>
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>Private Folder Password</Label>
                                    <Input 
                                        type="text" 
                                        value={privatePassword} 
                                        onChange={(e) => setPrivatePassword(e.target.value)}
                                        placeholder="Leave empty to disable password access"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        This password allows anyone with the URL and password to access private files without logging in.
                                    </p>
                                </div>
                                <Button onClick={handleSaveSettings} className="w-full sm:w-auto">Save Settings</Button>
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "api-keys" && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Create API Key</CardTitle>
                                    <CardDescription>Generate a new API key for programmatic access.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {newApiKey ? (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-muted rounded-lg border-2 border-primary">
                                                <p className="text-sm font-medium mb-2 text-muted-foreground">Your new API key:</p>
                                                <code className="text-sm break-all block bg-background p-2 rounded">{newApiKey}</code>
                                                <p className="text-xs text-destructive mt-2 font-semibold">⚠️ Save this key now - it won't be shown again!</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button onClick={() => copyApiKey(newApiKey)} className="flex-1">
                                                    <Copy className="mr-2 h-4 w-4" /> Copy Key
                                                </Button>
                                                <Button variant="outline" onClick={() => setNewApiKey(null)}>
                                                    Done
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleCreateApiKey} className="space-y-4">
                                            <div className="grid gap-2">
                                                <Label>Key Name (optional)</Label>
                                                <Input 
                                                    value={newApiKeyName} 
                                                    onChange={(e) => setNewApiKeyName(e.target.value)}
                                                    placeholder="e.g., Production API, Development"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Give your API key a name to help identify it later.
                                                </p>
                                            </div>
                                            <Button type="submit" disabled={isCreatingKey} className="w-full sm:w-auto">
                                                {isCreatingKey ? "Creating..." : "Create API Key"}
                                            </Button>
                                        </form>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Your API Keys</CardTitle>
                                    <CardDescription>Manage your API keys. Use them in the Authorization header: <code className="bg-muted px-1 py-0.5 rounded text-xs">Authorization: Bearer YOUR_API_KEY</code></CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {apiKeys.length === 0 ? (
                                        <p className="text-muted-foreground text-center py-8">No API keys created yet.</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Name</TableHead>
                                                        <TableHead>Created</TableHead>
                                                        <TableHead>Last Used</TableHead>
                                                        <TableHead className="text-right">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {apiKeys.map((key) => (
                                                        <TableRow key={key.id}>
                                                            <TableCell className="font-medium">
                                                                {key.name || <span className="text-muted-foreground italic">Unnamed</span>}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {new Date(key.created_at).toLocaleDateString()}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm" 
                                                                    onClick={() => handleDeleteApiKey(key.id)}
                                                                >
                                                                    <Trash className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
