from __future__ import annotations

from datetime import date

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

from .analytics import (
    AnalyticsService,
    EnvironmentSleepCorrelation,
    FeedingSummary,
    InMemoryRepository,
    ReadOnlyRepository,
    SleepSummary,
)

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)


def create_server(repository: ReadOnlyRepository) -> MCPServer:
    service = AnalyticsService(repository)
    server = MCPServer(
        "Em Bé Curated Analytics",
        version="0.1.0",
        instructions="Chỉ đọc dữ liệu tổng hợp đã được duyệt; không chẩn đoán y khoa.",
    )

    @server.tool(annotations=READ_ONLY)
    def sleep_summary(start_date: date, end_date: date) -> SleepSummary:
        """Tổng hợp các phiên ngủ trong một khoảng tối đa 31 ngày."""
        return service.sleep_summary(start_date, end_date)

    @server.tool(annotations=READ_ONLY)
    def feeding_summary(start_date: date, end_date: date) -> FeedingSummary:
        """Tổng hợp số lần và lượng sữa trong một khoảng tối đa 31 ngày."""
        return service.feeding_summary(start_date, end_date)

    @server.tool(annotations=READ_ONLY)
    def environment_sleep_correlation(
        start_date: date, end_date: date
    ) -> EnvironmentSleepCorrelation:
        """Tính tương quan mô tả giữa môi trường và thời lượng ngủ, không chẩn đoán."""
        return service.environment_sleep_correlation(start_date, end_date)

    return server


mcp = create_server(InMemoryRepository())

if __name__ == "__main__":
    mcp.run()

