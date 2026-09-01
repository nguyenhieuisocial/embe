declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(documentDefinition: unknown): {
      download(filename?: string): Promise<void> | void;
      getBuffer(): Promise<Uint8Array>;
    };
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const vfs: Record<string, string>;
  export default vfs;
}
