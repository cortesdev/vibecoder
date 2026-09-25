import { NextResponse } from "next/server";
import { startProjectServer, stopProjectServer, getProjectServer } from "@/lib/project-server";
import { requireUser } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { files } = await request.json();

    // Write files and start server
    const server = await startProjectServer(id, files);

    return NextResponse.json({
      success: true,
      server: {
        id: server.projectId,
        url: server.url,
        status: server.status,
        port: server.port
      }
    });
  } catch (error: any) {
    console.error("Failed to start project server:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start server" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await stopProjectServer(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to stop project server:", error);
    return NextResponse.json(
      { error: error.message || "Failed to stop server" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const server = await getProjectServer(id);

    if (!server) {
      return NextResponse.json({ 
        success: false,
        server: { status: "stopped" } 
      });
    }

    return NextResponse.json({
      success: true,
      server: {
        id: server.projectId,
        url: server.url,
        status: server.status,
        port: server.port,
        error: server.error
      }
    });
  } catch (error: any) {
    console.error("Failed to get project server status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get server status" },
      { status: 500 }
    );
  }
}