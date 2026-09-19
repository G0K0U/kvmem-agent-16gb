import json, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, NullFormatter

BG, CARD, TEXT, MUTED = "#0D1117", "#161B22", "#E6EDF3", "#9DA7B3"
GREEN, BLUE, GRID = "#3FB950", "#58A6FF", "#21262D"

data = json.load(open("F:/AI/qqz-kvmem-dsh-16gb/evidence/capacity.json"))["completed"]
x = [d["prompt"] for d in data]; y = [d["tps"] for d in data]

plt.rcParams.update({
    "font.family": "Segoe UI", "text.color": TEXT, "axes.edgecolor": GRID,
    "axes.labelcolor": TEXT, "xtick.color": MUTED, "ytick.color": MUTED,
})

fig, ax = plt.subplots(figsize=(8, 8), dpi=200)
fig.patch.set_facecolor(BG); ax.set_facecolor(BG)

ax.axhspan(14, 20, color=GREEN, alpha=0.10, zorder=1)
ax.axhline(20, color=GREEN, alpha=0.35, lw=1.2, ls="--", zorder=2)
ax.axhline(14, color=GREEN, alpha=0.35, lw=1.2, ls="--", zorder=2)

ax.plot(x, y, color=BLUE, lw=3, marker="o", markersize=9,
        markerfacecolor=BLUE, markeredgecolor=BG, markeredgewidth=1.6, zorder=4)

ax.set_xscale("log")
ax.set_xlim(300, 300000); ax.set_ylim(6, 26)

last = data[-1]
ax.annotate(f"{last['prompt']:,} tokens\n{last['tps']:.1f} tok/s",
            xy=(last["prompt"], last["tps"]), xytext=(-10, 58), textcoords="offset points",
            ha="right", va="bottom", fontsize=15, fontweight="bold", color=GREEN,
            arrowprops=dict(arrowstyle="-", color=GREEN, lw=1.4))

ax.text(0.05, (17 - 6) / 20, "flat 14–20 tok/s", transform=ax.transAxes,
        ha="left", va="center", fontsize=17, fontweight="bold", color=GREEN)

def kfmt(v, _):  return f"{v/1000:.0f}K" if v >= 1000 else f"{v:.0f}"
ax.xaxis.set_major_formatter(FuncFormatter(kfmt))
ax.xaxis.set_minor_formatter(NullFormatter())
ax.set_xticks([1000, 10000, 100000])
ax.tick_params(axis="x", which="major", labelsize=17)
ax.tick_params(axis="y", labelsize=17)
ax.grid(True, which="major", color=GRID, lw=1, alpha=0.9, zorder=0)
for s in ("top", "right"): ax.spines[s].set_visible(False)

ax.set_xlabel("Input (prompt) tokens — log scale", fontsize=19, labelpad=12)
ax.set_ylabel("Decode speed (tok/s)", fontsize=19, labelpad=12)

fig.subplots_adjust(top=0.80, bottom=0.155, left=0.115, right=0.955)
fig.text(0.055, 0.925, "Decode speed vs. context length", fontsize=30, fontweight="bold", color=TEXT)
fig.text(0.055, 0.881, "27B GGUF · KVMem (KV cache in system RAM)", fontsize=16, color=MUTED)
fig.text(0.055, 0.854, "RTX 4080 16GB + 32GB RAM · everyday desktop, browsers open", fontsize=16, color=MUTED)
fig.text(0.055, 0.028, "15 measured requests · retrieval verified", fontsize=13, color=MUTED)
fig.text(0.955, 0.028, "github.com/G0K0U/kvmem-agent-16gb", fontsize=13,
         color=BLUE, ha="right", fontweight="bold")

fig.savefig("F:/AI/qqz-kvmem-dsh-16gb/assets/linkedin/capacity-curve-16gb.png", facecolor=BG)
print("saved")
