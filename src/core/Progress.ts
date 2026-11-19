/**
 * Real loading progress: a weighted list of tasks (fonts, physics wasm, models,
 * shader compilation…). The bar only moves when a task actually finishes.
 */
export interface Task {
  label: string;
  weight: number;
  run: () => Promise<unknown>;
}

export class Progress {
  private done = 0;
  private total = 0;

  constructor(private readonly onUpdate: (ratio: number, label: string) => void) {}

  /** Runs tasks in parallel; resolves when all have settled. Fails loudly on the first error. */
  async run(tasks: Task[]): Promise<void> {
    this.total = tasks.reduce((s, t) => s + t.weight, 0);
    this.onUpdate(0, tasks[0]?.label ?? '');
    await Promise.all(
      tasks.map(async (t) => {
        await t.run();
        this.done += t.weight;
        this.onUpdate(this.done / this.total, t.label);
      }),
    );
  }
}
