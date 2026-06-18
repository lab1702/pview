import pandas as pd
from pview.facets import Facet, infer_facets


def _df():
    return pd.DataFrame(
        {
            "name": ["Ada", "Bob", "Cy"],
            "age": [36, 41, 28],
            "gender": ["female", "male", "female"],
            "joined": pd.to_datetime(["2011-04-01", "2015-06-15", "2020-01-02"]),
            "bio": ["aaa", "bbb", "ccc"],
            "photo": ["a.png", "b.png", "c.png"],
        }
    )


def test_numeric_facet_has_min_max():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["age"].type == "numeric"
    assert facets["age"].min == 28
    assert facets["age"].max == 41


def test_category_facet_collects_sorted_values():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["gender"].type == "category"
    assert facets["gender"].values == ["female", "male"]


def test_date_facet_has_iso_min_max():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["joined"].type == "date"
    assert facets["joined"].min == "2011-04-01"
    assert facets["joined"].max == "2020-01-02"


def test_high_cardinality_text_facet():
    df = _df()
    df["bio"] = [f"unique text {i}" for i in range(3)]
    facets = {f.name: f for f in infer_facets(df, name_col="name", image_col="photo", category_threshold=2)}
    assert facets["bio"].type == "text"


def test_name_is_text_facet_and_image_excluded():
    facets = {f.name: f for f in infer_facets(_df(), name_col="name", image_col="photo")}
    assert facets["name"].type == "text"
    assert "photo" not in facets


def test_override_forces_category():
    df = _df()
    df["age"] = [1, 2, 3]
    facets = {f.name: f for f in infer_facets(df, name_col="name", image_col="photo", overrides={"age": "category"})}
    assert facets["age"].type == "category"
    assert facets["age"].values == ["1", "2", "3"]


def test_override_unknown_column_raises():
    import pytest
    with pytest.raises(ValueError):
        infer_facets(_df(), name_col="name", overrides={"nope": "category"})


def test_to_dict_omits_none_fields():
    f = Facet(name="x", type="text")
    assert f.to_dict() == {"name": "x", "type": "text"}
