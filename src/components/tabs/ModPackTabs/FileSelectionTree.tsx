import React, { useState, useMemo } from "react";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";

export interface FileNode {
    name: string;
    path: string; // relative path using forward slashes
    type: "directory" | "file";
    size?: number;
    children?: FileNode[];
}

interface FileSelectionTreeProps {
    data: FileNode[];
    includedPaths: string[];
    onChange: (paths: string[]) => void;
    colors: any;
}

export function FileSelectionTree({ data, includedPaths, onChange, colors }: FileSelectionTreeProps) {
    const { t } = useTranslation();

    // Helper to get all file paths recursively from a node
    const getAllFilePaths = (node: FileNode): string[] => {
        if (node.type === "file") return [node.path];
        return node.children?.flatMap(getAllFilePaths) || [];
    };

    // Helper to check if a node is selected (all descendants selected)
    const getNodeState = (node: FileNode): "checked" | "unchecked" | "indeterminate" => {
        if (node.type === "file") {
            return includedPaths.includes(node.path) ? "checked" : "unchecked";
        }
        
        const children = node.children || [];
        if (children.length === 0) return "unchecked"; // Empty folder?

        const childStates = children.map(getNodeState);
        const allChecked = childStates.every(s => s === "checked");
        const allUnchecked = childStates.every(s => s === "unchecked");

        if (allChecked) return "checked";
        if (allUnchecked) return "unchecked";
        return "indeterminate";
    };

    const handleToggle = (node: FileNode) => {
        const state = getNodeState(node);
        const allNodePaths = getAllFilePaths(node);
        
        // If checked or indeterminate -> uncheck all
        // If unchecked -> check all
        const shouldCheck = state === "unchecked";

        const newSet = new Set(includedPaths);
        if (shouldCheck) {
            allNodePaths.forEach(p => newSet.add(p));
        } else {
            allNodePaths.forEach(p => newSet.delete(p));
        }
        onChange(Array.from(newSet));
    };

    return (
        <div className="border rounded-lg overflow-hidden" style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainer }}>
            <div className="max-h-[300px] overflow-y-auto p-2">
                {data.map(node => (
                    <TreeNode
                        key={node.path}
                        node={node}
                        includedPaths={includedPaths}
                        onToggle={handleToggle}
                        colors={colors}
                        getNodeState={getNodeState}
                    />
                ))}
            </div>
        </div>
    );
}

interface TreeNodeProps {
    node: FileNode;
    includedPaths: string[];
    onToggle: (node: FileNode) => void;
    colors: any;
    getNodeState: (node: FileNode) => "checked" | "unchecked" | "indeterminate";
    level?: number;
}

function TreeNode({ node, includedPaths, onToggle, colors, getNodeState, level = 0 }: TreeNodeProps) {
    const [expanded, setExpanded] = useState(level < 1); // Default expand top level
    const state = getNodeState(node);
    const hasChildren = node.type === "directory" && (node.children?.length || 0) > 0;

    return (
        <div>
            <div 
                className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer select-none"
                style={{ paddingLeft: `${(level * 16) + 8}px` }}
                onClick={() => {
                   if (hasChildren && node.type === "directory") {
                      // If clicking anywhere on the row, toggle expand? 
                      // Or should we have separate click targets for expand vs check?
                      // Let's make the whole row toggle selection EXCEPT the chevron
                   }
                }}
            >
                {/* Expand Toggle */}
                <div 
                    className={`w-4 h-4 flex items-center justify-center transition-transform ${expanded ? "rotate-90" : ""} ${hasChildren ? "cursor-pointer hover:text-white" : "opacity-0 pointer-events-none"}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                    }}
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <i className="fa-solid fa-chevron-right text-[10px]" />
                </div>

                {/* Checkbox */}
                <div 
                    className="w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer"
                    style={{ 
                        borderColor: state !== "unchecked" ? colors.primary : colors.outline,
                        backgroundColor: state !== "unchecked" ? colors.primary : "transparent"
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(node);
                    }}
                >
                    {state === "checked" && <i className="fa-solid fa-check text-[10px] text-white" />}
                    {state === "indeterminate" && <div className="w-2 h-0.5 bg-white rounded-full" />}
                </div>

                {/* Icon */}
                <div className="w-5 flex justify-center opacity-70" style={{ color: colors.secondary }}>
                    {node.type === "directory" ? <Icons.Folder className="w-4 h-4" /> : <i className="fa-regular fa-file text-xs" />}
                </div>

                {/* Name */}
                <span 
                    className="text-sm truncate flex-1" 
                    style={{ color: colors.onSurface }}
                    onClick={() => onToggle(node)}
                >
                    {node.name}
                </span>

                {/* Size (optional) */}
                {node.size !== undefined && (
                    <span className="text-xs opacity-50" style={{ color: colors.onSurfaceVariant }}>
                        {formatBytes(node.size)}
                    </span>
                )}
            </div>

            {/* Children */}
            {expanded && node.children && (
                <div>
                    {node.children.map(child => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            includedPaths={includedPaths}
                            onToggle={onToggle}
                            colors={colors}
                            getNodeState={getNodeState}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function formatBytes(bytes: number, decimals = 1) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
