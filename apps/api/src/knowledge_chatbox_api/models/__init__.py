"""模型包导出。

避免在 package import 阶段级联加载全部模型，否则像
``schemas._validators -> models.enums`` 这样的轻量引用也会把
``models.settings -> schemas.settings`` 一起拉起来，导致循环导入。
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from knowledge_chatbox_api.models.auth import AuthSession as AuthSession
    from knowledge_chatbox_api.models.auth import User as User
    from knowledge_chatbox_api.models.chat import (
        ChatMessage as ChatMessage,
    )
    from knowledge_chatbox_api.models.chat import (
        ChatMessageAttachment as ChatMessageAttachment,
    )
    from knowledge_chatbox_api.models.chat import (
        ChatRun as ChatRun,
    )
    from knowledge_chatbox_api.models.chat import (
        ChatSession as ChatSession,
    )
    from knowledge_chatbox_api.models.document import (
        Document as Document,
    )
    from knowledge_chatbox_api.models.document import (
        DocumentRevision as DocumentRevision,
    )
    from knowledge_chatbox_api.models.settings import AppSettings as AppSettings
    from knowledge_chatbox_api.models.space import Space as Space
