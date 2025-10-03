export class UIPanel {
  private element: HTMLDivElement;

  constructor(id: string, title?: string) {
    const root = document.getElementById("ui-root");
    if (!root) {
      throw new Error("ui-root missing");
    }
    this.element = document.createElement("div");
    this.element.id = id;
    this.element.className = "ui-panel";
    if (title) {
      const heading = document.createElement("h3");
      heading.innerText = title;
      this.element.appendChild(heading);
    }
    root.appendChild(this.element);
  }

  setHTML(html: string): void {
    this.element.innerHTML = html;
  }

  clear(): void {
    this.element.innerHTML = "";
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? "block" : "none";
  }

  getEl(): HTMLDivElement {
    return this.element;
  }

  destroy(): void {
    this.element.remove();
  }
}
