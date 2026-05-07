export const RESIZE_DEAD_ZONE_PX = 2.5;
export const MIN_EDITOR_PANEL_PERCENT = 30;
export const MAX_EDITOR_PANEL_PERCENT = 70;

export class ResizableSplit {
	widthPercent = $state(50);
	isResizing = $state(false);
	isHovered = $state(false);

	#drag = $state<{
		pointerId: number;
		startX: number;
		startWidthPercent: number;
	} | null>(null);

	#clampWidth(next: number): number {
		return Math.min(MAX_EDITOR_PANEL_PERCENT, Math.max(MIN_EDITOR_PANEL_PERCENT, next));
	}

	#endDrag(event: PointerEvent, currentTarget: HTMLElement): void {
		if (event.pointerId !== this.#drag?.pointerId) return;
		if (currentTarget.hasPointerCapture(event.pointerId)) {
			currentTarget.releasePointerCapture(event.pointerId);
		}
		this.isResizing = false;
		this.#drag = null;
	}

	onPointerDown(event: PointerEvent, isNarrowViewport: boolean): void {
		if (isNarrowViewport) return;

		this.#drag = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startWidthPercent: this.widthPercent
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	onPointerMove(event: PointerEvent, containerElement: HTMLDivElement | null): void {
		const drag = this.#drag;
		if (!drag || event.pointerId !== drag.pointerId || !containerElement) {
			return;
		}
		if (!this.isResizing) {
			if (Math.abs(event.clientX - drag.startX) < RESIZE_DEAD_ZONE_PX) return;
			this.isResizing = true;
		}

		const rect = containerElement.getBoundingClientRect();
		if (rect.width <= 0) return;

		const deltaX = event.clientX - drag.startX;
		const deltaPercent = (deltaX / rect.width) * 100;
		this.widthPercent = this.#clampWidth(drag.startWidthPercent + deltaPercent);
	}

	onPointerUp(event: PointerEvent): void {
		this.#endDrag(event, event.currentTarget as HTMLElement);
	}

	onPointerCancel(event: PointerEvent): void {
		this.#endDrag(event, event.currentTarget as HTMLElement);
	}

	onPointerEnter(): void {
		this.isHovered = true;
	}

	onPointerLeave(): void {
		this.isHovered = false;
	}
}
