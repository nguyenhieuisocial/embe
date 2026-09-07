import pytest
from embe_studio.web_worker import validate_document, NoRedirect

def document():
    return dict(title='Một điều nhỏ',stage='Mẹ bầu',caption='',scenes=[dict(heading='Hôm nay',text='Ghi lại một câu hỏi.')],sources=[dict(title='NHS',url='https://www.nhs.uk/pregnancy/')])

def test_document_limits_and_no_arbitrary_source_ingestion():
    assert validate_document(document())['title']=='Một điều nhỏ'
    for changed in [dict(scenes=[]),dict(title=1),dict(scenes=[dict(heading='x',text='a'*181)]),dict(sources=[]),dict(sources=[dict(title='x',url='file:///C:/Anh')]),dict(raw_path='C:/Anh')]:
        with pytest.raises(ValueError,match='invalid_project'):validate_document({**document(),**changed})

def test_redirects_are_never_followed():
    assert NoRedirect().redirect_request(None,None,302,'',{},'https://evil.test') is None

def test_pinned_voice_and_speed_only_backward_compatible():
    assert 'voice' not in validate_document(document())
    for voice in ('ai-han-south','piper','thuc-doan-south-v1','my-duyen-south-v1'):
        for speed in (.95,1,1.05):
            assert validate_document({**document(),'voice':{'id':voice,'speed':speed}})['voice']=={'id':voice,'speed':speed}
    for v in [None,{}, {'id':'remote-url','speed':1}, {'id':'ai-han-south','speed':True}, {'id':'piper','speed':0}, {'id':'piper','speed':1,'path':'C:/Anh'}]:
        with pytest.raises(ValueError,match='invalid_project'):validate_document({**document(),'voice':v})
