import { jest } from "@jest/globals";

import { testIde } from "../test/fixtures";
import {
  insertMockChunks,
  mockPathAndCacheKey,
  updateIndexAndAwaitGenerator,
} from "./test/indexing";

import fs from "fs";
import { getIndexSqlitePath } from "../util/paths";
import { CodeSnippetsCodebaseIndex } from "./CodeSnippetsIndex";
import { DatabaseConnection, SqliteDb } from "./refreshIndex";
import { IndexResultType } from "./types";

describe("CodeSnippetsCodebaseIndex", () => {
  let index: CodeSnippetsCodebaseIndex;
  let db: DatabaseConnection;

  async function getAllSnippets() {
    return await db.all("SELECT * FROM code_snippets");
  }

  async function getAllSnippetTags() {
    return await db.all("SELECT * FROM code_snippets_tags");
  }

  beforeAll(async () => {
    // 删除测试数据库文件，确保每次测试都是全新数据库
    const dbPath = getIndexSqlitePath();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    db = await SqliteDb.get();

    // 显式创建数据库表
    await CodeSnippetsCodebaseIndex._createTables(db);

    // 清理测试数据
    await db.run("DELETE FROM code_snippets_tags");
    await db.run("DELETE FROM code_snippets");

    index = new CodeSnippetsCodebaseIndex(testIde);
  });

  it("should update the index and maintain expected database state", async () => {
    const mockMarkComplete = jest
      .fn()
      .mockImplementation(() => Promise.resolve()) as any;

    const mockSnippet = {
      title: "",
      content: "",
      signature: "",
      startLine: 0,
      endLine: 1,
    };

    // We mock this fn since currently in testing the directory structure to access the tree-sitter
    // binaries does not match what is in the release environment.
    jest
      .spyOn(CodeSnippetsCodebaseIndex.prototype, "getSnippetsInFile")
      .mockResolvedValue([mockSnippet]);

    await insertMockChunks();

    // Compute test
    await updateIndexAndAwaitGenerator(index, "compute", mockMarkComplete);
    expect((await getAllSnippetTags()).length).toBe(1);
    expect((await getAllSnippets()).length).toBe(1);
    expect(mockMarkComplete).toHaveBeenCalledWith(
      [mockPathAndCacheKey],
      IndexResultType.Compute,
    );

    // RemoveTag test
    await updateIndexAndAwaitGenerator(index, "removeTag", mockMarkComplete);
    expect((await getAllSnippetTags()).length).toBe(0);
    expect(mockMarkComplete).toHaveBeenCalledWith(
      [mockPathAndCacheKey],
      IndexResultType.RemoveTag,
    );

    // AddTag test
    await updateIndexAndAwaitGenerator(index, "addTag", mockMarkComplete);
    expect((await getAllSnippetTags()).length).toBe(1);
    expect(mockMarkComplete).toHaveBeenCalledWith(
      [mockPathAndCacheKey],
      IndexResultType.AddTag,
    );

    // Delete test
    await updateIndexAndAwaitGenerator(index, "del", mockMarkComplete);
    expect((await getAllSnippetTags()).length).toBe(0);
    expect((await getAllSnippets()).length).toBe(0);
    expect(mockMarkComplete).toHaveBeenCalledWith(
      [mockPathAndCacheKey],
      IndexResultType.Delete,
    );
  });
});
