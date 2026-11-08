"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  label: string;
  value: string;
  content: ReactNode;
};

type SegmentedTabsProps = {
  tabs: Tab[];
  defaultValue?: string;
};

export function SegmentedTabs({
  tabs,
  defaultValue,
}: SegmentedTabsProps) {
  const [activeTab, setActiveTab] = useState(
    defaultValue ?? tabs[0]?.value
  );

  const selectedTab = tabs.find(
    (tab) => tab.value === activeTab
  );

  return (
    <div className="space-y-4">
      {/* Tab buttons */}
      <div
        className="w-[300px] ml-auto flex flex-end overflow-hidden rounded-xl bg-slate-400"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`w-[250px] px-3 py-3 text-sm transition-colors ${
              activeTab === tab.value
                ? "bg-blue-100 text-slate-900"
                : "bg-slate-400 text-white hover:bg-slate-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Selected tab content */}
      <div role="tabpanel" className="w-full">
        {selectedTab?.content}
      </div>
    </div>
  );
}